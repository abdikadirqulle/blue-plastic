import 'server-only'

import { toDate, type CalendarDate } from '@/lib/date'
import { Decimal, ZERO } from '@/lib/money'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'

/**
 * Accounts receivable reporting.
 *
 * Every figure here comes from the same rows as the receivables control account:
 * an invoice's total, less what has been applied to it. There is no separate
 * balance to reconcile, so the aging report and the trial balance cannot
 * disagree — which is the whole reason R7 requires a customer on every AR line.
 */

export const AGING_BUCKETS = [
  'unapplied',
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export const BUCKET_LABELS: Record<AgingBucket, string> = {
  unapplied: 'Not on a document',
  current: 'Not yet due',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
}

/** Buckets that represent something actually overdue. */
export const OVERDUE_BUCKETS = AGING_BUCKETS.filter(
  (bucket) => bucket !== 'current' && bucket !== 'unapplied',
)

export const emptyBuckets = (): Record<AgingBucket, Decimal> => ({
  unapplied: ZERO, current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO,
})

export type AgingRow = {
  customerId: string
  customerName: string
  buckets: Record<AgingBucket, Decimal>
  total: Decimal
}

export type AgingReport = {
  rows: AgingRow[]
  totals: Record<AgingBucket, Decimal>
  grandTotal: Decimal
  asOf: CalendarDate
  /** The receivables control account balance, for comparison. */
  controlBalance: Decimal
  agrees: boolean
}

export async function aging(
  ctx: OrgContext,
  asOf: CalendarDate,
  options: { client?: Tx } = {},
): Promise<AgingReport> {
  const client = options.client ?? db
  const asOfDate = toDate(asOf)

  const [rows, subledger] = await Promise.all([
    client.$queryRaw<
      {
        customerId: string
        customerName: string
        days: number | null
        outstanding: string
      }[]
    >`
      SELECT d."customerId"                       AS "customerId",
             c."displayName"                      AS "customerName",
             (${asOfDate}::date - d."dueDate")    AS days,
             (d.total - COALESCE((
                SELECT SUM(a.amount) FROM sales_applications a WHERE a."invoiceId" = d.id
             ), 0))                               AS outstanding
        FROM sales_documents d
        JOIN customers c ON c.id = d."customerId"
       WHERE d."orgId"  = ${ctx.orgId}
         AND d."deletedAt" IS NULL
         AND d.type     = 'INVOICE'
         AND d.status  IN ('OPEN', 'PARTIAL')
         AND d.date    <= ${asOfDate}
    `,
    // The control account, broken down by whose balance it is.
    //
    // This is what makes the report tie out. Not every receivable comes from an
    // open invoice: an opening balance posts straight to the control account, a
    // payment can sit unapplied, and a hand-written entry can raise or write off
    // a balance with no document at all. Those used to be invisible here, so the
    // report quietly disagreed with the ledger the first time anybody entered a
    // customer with an opening balance.
    client.$queryRaw<{ customerId: string; customerName: string; balance: string }[]>`
      SELECT l."customerId"    AS "customerId",
             c."displayName"   AS "customerName",
             COALESCE(SUM(l.debit - l.credit), 0) AS balance
        FROM journal_lines l
        JOIN journals j ON j.id = l."journalId" AND j.status NOT IN ('DRAFT', 'DELETED')
        JOIN ledger_accounts a ON a.id = l."accountId"
        JOIN customers c ON c.id = l."customerId"
       WHERE l."orgId" = ${ctx.orgId}
         AND a."systemKey" = 'ACCOUNTS_RECEIVABLE'
         AND l."journalDate" <= ${asOfDate}
       GROUP BY l."customerId", c."displayName"
    `,
  ])

  const byCustomer = new Map<string, AgingRow>()
  const totals = emptyBuckets()
  let grandTotal = ZERO

  const rowFor = (customerId: string, customerName: string): AgingRow => {
    const existing = byCustomer.get(customerId)
    if (existing) return existing
    const created: AgingRow = {
      customerId,
      customerName,
      buckets: emptyBuckets(),
      total: ZERO,
    }
    byCustomer.set(customerId, created)
    return created
  }

  const add = (row: AgingRow, bucket: AgingBucket, amount: Decimal) => {
    row.buckets[bucket] = row.buckets[bucket].plus(amount)
    row.total = row.total.plus(amount)
    totals[bucket] = totals[bucket].plus(amount)
    grandTotal = grandTotal.plus(amount)
  }

  const documentTotals = new Map<string, Decimal>()

  for (const row of rows) {
    const outstanding = new Decimal(row.outstanding)
    if (outstanding.lessThanOrEqualTo(0)) continue

    add(rowFor(row.customerId, row.customerName), bucketFor(row.days), outstanding)
    documentTotals.set(
      row.customerId,
      (documentTotals.get(row.customerId) ?? ZERO).plus(outstanding),
    )
  }

  // Whatever the ledger holds for a customer that no open invoice explains. It
  // is a real part of what they owe — or, when negative, of what is held on
  // account for them — so it belongs on the report rather than in the gap
  // between the report and the trial balance.
  for (const entry of subledger) {
    const balance = new Decimal(entry.balance)
    const explained = documentTotals.get(entry.customerId) ?? ZERO
    const residual = balance.minus(explained)
    if (residual.abs().lessThan('0.005')) continue

    add(rowFor(entry.customerId, entry.customerName), 'unapplied', residual)
  }

  const controlBalance = subledger.reduce(
    (sum, entry) => sum.plus(new Decimal(entry.balance)),
    ZERO,
  )

  return {
    rows: [...byCustomer.values()]
      .filter((row) => !row.total.isZero())
      .sort((a, b) => a.customerName.localeCompare(b.customerName)),
    totals,
    grandTotal,
    asOf,
    controlBalance,
    agrees: grandTotal.minus(controlBalance).abs().lessThan('0.005'),
  }
}

function bucketFor(daysOverdue: number | null): AgingBucket {
  if (daysOverdue === null || daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'd1_30'
  if (daysOverdue <= 60) return 'd31_60'
  if (daysOverdue <= 90) return 'd61_90'
  return 'd90_plus'
}

export type StatementEntry = {
  id: string
  kind: 'INVOICE' | 'CREDIT_MEMO' | 'PAYMENT' | 'SALES_RECEIPT' | 'REFUND_RECEIPT'
  number: string
  date: Date
  dueDate: Date | null
  description: string
  charge: Decimal
  credit: Decimal
  balance: Decimal
  /** Where the document lives, so a statement line is a way in to it. */
  href: string
}

/**
 * A customer statement: everything that moved their balance, in date order,
 * with a running total. This is what gets sent when someone asks "what do I owe?"
 */
export async function statement(
  ctx: OrgContext,
  customerId: string,
  range: { from: CalendarDate; to: CalendarDate },
  options: { client?: Tx } = {},
): Promise<{ opening: Decimal; entries: StatementEntry[]; closing: Decimal }> {
  const client = options.client ?? db

  const [openingRow] = await client.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status NOT IN ('DRAFT', 'DELETED')
     WHERE l."orgId" = ${ctx.orgId}
       AND l."customerId" = ${customerId}
       AND l."journalDate" < ${toDate(range.from)}
  `
  const opening = new Decimal(openingRow?.balance ?? '0')

  const [documents, payments] = await Promise.all([
    client.salesDocument.findMany({
      where: {
        orgId: ctx.orgId,
        customerId,
        status: { notIn: ['DRAFT', 'VOID'] },
        type: { in: ['INVOICE', 'CREDIT_MEMO', 'SALES_RECEIPT', 'REFUND_RECEIPT'] },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: {
        id: true, type: true, number: true, date: true, dueDate: true, total: true, memo: true,
        reference: true,
      },
    }),
    client.customerPayment.findMany({
      where: {
        orgId: ctx.orgId,
        customerId,
        status: { not: 'VOID' },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: { id: true, number: true, date: true, amount: true, memo: true },
    }),
  ])

  const entries: Omit<StatementEntry, 'balance'>[] = [
    ...documents.map((document) => {
      const total = new Decimal(document.total.toString())
      // An invoice increases what the customer owes; a credit memo reduces it.
      // Receipts and refunds never touched receivables, so they are shown for
      // completeness with no effect on the running balance.
      const isCharge = document.type === 'INVOICE'
      const isCredit = document.type === 'CREDIT_MEMO'
      return {
        id: document.id,
        kind: document.type as StatementEntry['kind'],
        number: document.number,
        date: document.date,
        dueDate: document.dueDate,
        description: document.memo ?? document.reference ?? labelFor(document.type),
        charge: isCharge ? total : ZERO,
        credit: isCredit ? total : ZERO,
        href: `/sales/${SLUG[document.type] ?? 'invoices'}/${document.id}`,
      }
    }),
    ...payments.map((payment) => ({
      id: payment.id,
      kind: 'PAYMENT' as const,
      number: payment.number,
      date: payment.date,
      dueDate: null,
      description: payment.memo ?? 'Payment received',
      charge: ZERO,
      credit: new Decimal(payment.amount.toString()),
      href: '/payments',
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.number.localeCompare(b.number))

  let running = opening
  const withBalances = entries.map((entry) => {
    running = running.plus(entry.charge).minus(entry.credit)
    return { ...entry, balance: running }
  })

  return { opening, entries: withBalances, closing: running }
}

const SLUG: Record<string, string> = {
  INVOICE: 'invoices',
  CREDIT_MEMO: 'credit-memos',
  SALES_RECEIPT: 'sales-receipts',
  REFUND_RECEIPT: 'refunds',
}

function labelFor(type: string): string {
  switch (type) {
    case 'INVOICE':
      return 'Invoice'
    case 'CREDIT_MEMO':
      return 'Credit memo'
    case 'SALES_RECEIPT':
      return 'Sales receipt'
    case 'REFUND_RECEIPT':
      return 'Refund'
    default:
      return type
  }
}
