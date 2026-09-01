import 'server-only'

import { toDate, type CalendarDate } from '@/lib/date'
import { Decimal, ZERO } from '@/lib/money'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import {
  AGING_BUCKETS,
  BUCKET_LABELS,
  emptyBuckets,
  OVERDUE_BUCKETS,
  type AgingBucket,
} from '@/server/services/receivables.service'

export { AGING_BUCKETS, BUCKET_LABELS, OVERDUE_BUCKETS }

export type PayablesAgingRow = {
  vendorId: string
  vendorName: string
  buckets: Record<AgingBucket, Decimal>
  total: Decimal
}

/**
 * What the business owes, and for how long — the mirror of the receivables aging.
 *
 * Same construction, same self-check: every figure comes from the same rows as
 * the payables control account, and the report says whether it agrees rather than
 * leaving it to be assumed.
 */
export async function aging(
  ctx: OrgContext,
  asOf: CalendarDate,
  options: { client?: Tx } = {},
): Promise<{
  rows: PayablesAgingRow[]
  totals: Record<AgingBucket, Decimal>
  grandTotal: Decimal
  controlBalance: Decimal
  agrees: boolean
  asOf: CalendarDate
}> {
  const client = options.client ?? db
  const asOfDate = toDate(asOf)

  const [rows, subledger] = await Promise.all([
    client.$queryRaw<
      { vendorId: string; vendorName: string; days: number | null; outstanding: string }[]
    >`
      SELECT d."vendorId"                      AS "vendorId",
             v."displayName"                   AS "vendorName",
             (${asOfDate}::date - d."dueDate") AS days,
             (d.total - COALESCE((
                SELECT SUM(a.amount) FROM purchase_applications a WHERE a."billId" = d.id
             ), 0))                            AS outstanding
        FROM purchase_documents d
        JOIN vendors v ON v.id = d."vendorId"
       WHERE d."orgId" = ${ctx.orgId}
         AND d."deletedAt" IS NULL
         AND d.type    = 'BILL'
         AND d.status IN ('OPEN', 'PARTIAL')
         AND d.date   <= ${asOfDate}
    `,
    // Payables are a credit balance, so the control account is read the other
    // way up. Broken down by vendor for the same reason the receivables report
    // breaks its control account down by customer: an opening balance, an
    // unapplied payment or a hand-written entry is a real payable with no open
    // bill behind it, and leaving it out is what made the two disagree.
    client.$queryRaw<{ vendorId: string; vendorName: string; balance: string }[]>`
      SELECT l."vendorId"     AS "vendorId",
             v."displayName"  AS "vendorName",
             COALESCE(SUM(l.credit - l.debit), 0) AS balance
        FROM journal_lines l
        JOIN journals j ON j.id = l."journalId" AND j.status NOT IN ('DRAFT', 'DELETED')
        JOIN ledger_accounts a ON a.id = l."accountId"
        JOIN vendors v ON v.id = l."vendorId"
       WHERE l."orgId" = ${ctx.orgId}
         AND a."systemKey" = 'ACCOUNTS_PAYABLE'
         AND l."journalDate" <= ${asOfDate}
       GROUP BY l."vendorId", v."displayName"
    `,
  ])

  const byVendor = new Map<string, PayablesAgingRow>()
  const totals = emptyBuckets()
  let grandTotal = ZERO

  const rowFor = (vendorId: string, vendorName: string): PayablesAgingRow => {
    const existing = byVendor.get(vendorId)
    if (existing) return existing
    const created: PayablesAgingRow = {
      vendorId,
      vendorName,
      buckets: emptyBuckets(),
      total: ZERO,
    }
    byVendor.set(vendorId, created)
    return created
  }

  const add = (row: PayablesAgingRow, bucket: AgingBucket, amount: Decimal) => {
    row.buckets[bucket] = row.buckets[bucket].plus(amount)
    row.total = row.total.plus(amount)
    totals[bucket] = totals[bucket].plus(amount)
    grandTotal = grandTotal.plus(amount)
  }

  const documentTotals = new Map<string, Decimal>()

  for (const row of rows) {
    const outstanding = new Decimal(row.outstanding)
    if (outstanding.lessThanOrEqualTo(0)) continue

    add(rowFor(row.vendorId, row.vendorName), bucketFor(row.days), outstanding)
    documentTotals.set(row.vendorId, (documentTotals.get(row.vendorId) ?? ZERO).plus(outstanding))
  }

  for (const entry of subledger) {
    const balance = new Decimal(entry.balance)
    const residual = balance.minus(documentTotals.get(entry.vendorId) ?? ZERO)
    if (residual.abs().lessThan('0.005')) continue

    add(rowFor(entry.vendorId, entry.vendorName), 'unapplied', residual)
  }

  const controlBalance = subledger.reduce(
    (sum, entry) => sum.plus(new Decimal(entry.balance)),
    ZERO,
  )

  return {
    rows: [...byVendor.values()]
      .filter((row) => !row.total.isZero())
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    totals,
    grandTotal,
    controlBalance,
    agrees: grandTotal.minus(controlBalance).abs().lessThan('0.005'),
    asOf,
  }
}

function bucketFor(daysOverdue: number | null): AgingBucket {
  if (daysOverdue === null || daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'd1_30'
  if (daysOverdue <= 60) return 'd31_60'
  if (daysOverdue <= 90) return 'd61_90'
  return 'd90_plus'
}

/** Everything still owed, oldest first — the list someone works through on pay day. */
export async function unpaidBills(ctx: OrgContext, asOf: CalendarDate) {
  const bills = await db.purchaseDocument.findMany({
    where: { orgId: ctx.orgId, type: 'BILL', status: { in: ['OPEN', 'PARTIAL'] } },
    select: {
      id: true, number: true, reference: true, date: true, dueDate: true, total: true,
      vendor: { select: { id: true, displayName: true } },
      applications: { select: { amount: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
  })

  return bills
    .map((bill) => {
      const applied = bill.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
      const balance = new Decimal(bill.total.toString()).minus(applied)
      const daysOverdue = bill.dueDate
        ? Math.floor((toDate(asOf).getTime() - bill.dueDate.getTime()) / 86_400_000)
        : 0
      return { ...bill, total: bill.total.toString(), balance, daysOverdue }
    })
    .filter((bill) => bill.balance.greaterThan(0))
}

export type VendorStatementEntry = {
  id: string
  kind: 'BILL' | 'VENDOR_CREDIT' | 'PAYMENT' | 'EXPENSE'
  number: string
  date: Date
  dueDate: Date | null
  description: string
  /** What increased the amount owed. */
  charge: Decimal
  /** What reduced it. */
  credit: Decimal
  balance: Decimal
  href: string
}

/**
 * A vendor statement: everything that moved what the business owes them, in date
 * order, with a running balance.
 *
 * The mirror of the customer statement, and it exists for the same reason —
 * "what do we owe you?" is a question with one right answer, and it should come
 * from the same rows as the payables control account rather than from a separate
 * tally. Expenses are listed for completeness and do not move the balance:
 * they never became a payable.
 */
export async function vendorStatement(
  ctx: OrgContext,
  vendorId: string,
  range: { from: CalendarDate; to: CalendarDate },
  options: { client?: Tx } = {},
): Promise<{ opening: Decimal; entries: VendorStatementEntry[]; closing: Decimal }> {
  const client = options.client ?? db

  const [openingRow] = await client.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.credit - l.debit), 0) AS balance
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status NOT IN ('DRAFT', 'DELETED')
     WHERE l."orgId" = ${ctx.orgId}
       AND l."vendorId" = ${vendorId}
       AND l."journalDate" < ${toDate(range.from)}
  `
  const opening = new Decimal(openingRow?.balance ?? '0')

  const [documents, payments] = await Promise.all([
    client.purchaseDocument.findMany({
      where: {
        orgId: ctx.orgId,
        vendorId,
        status: { notIn: ['DRAFT', 'VOID'] },
        type: { in: ['BILL', 'VENDOR_CREDIT', 'EXPENSE'] },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: { id: true, type: true, number: true, date: true, dueDate: true, total: true, memo: true, reference: true },
    }),
    client.billPayment.findMany({
      where: {
        orgId: ctx.orgId,
        vendorId,
        status: { not: 'VOID' },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: { id: true, number: true, date: true, amount: true, memo: true, reference: true },
    }),
  ])

  const slug: Record<string, string> = {
    BILL: 'bills',
    VENDOR_CREDIT: 'vendor-credits',
    EXPENSE: 'expenses',
  }

  const entries: Omit<VendorStatementEntry, 'balance'>[] = [
    ...documents.map((document) => {
      const total = new Decimal(document.total.toString())
      return {
        id: document.id,
        kind: document.type as VendorStatementEntry['kind'],
        number: document.number,
        date: document.date,
        dueDate: document.dueDate,
        description: document.memo ?? document.reference ?? labelFor(document.type),
        charge: document.type === 'BILL' ? total : ZERO,
        credit: document.type === 'VENDOR_CREDIT' ? total : ZERO,
        href: `/purchases/${slug[document.type] ?? 'bills'}/${document.id}`,
      }
    }),
    ...payments.map((payment) => ({
      id: payment.id,
      kind: 'PAYMENT' as const,
      number: payment.number,
      date: payment.date,
      dueDate: null,
      description: payment.memo ?? payment.reference ?? 'Payment made',
      charge: ZERO,
      credit: new Decimal(payment.amount.toString()),
      href: '/bill-payments',
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.number.localeCompare(b.number))

  let running = opening
  const withBalances = entries.map((entry) => {
    running = running.plus(entry.charge).minus(entry.credit)
    return { ...entry, balance: running }
  })

  return { opening, entries: withBalances, closing: running }
}

function labelFor(type: string): string {
  switch (type) {
    case 'BILL':
      return 'Bill'
    case 'VENDOR_CREDIT':
      return 'Vendor credit'
    case 'EXPENSE':
      return 'Expense'
    default:
      return type
  }
}
