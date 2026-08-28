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

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: 'Not yet due',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
}

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

  const rows = await client.$queryRaw<
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
       AND d.type     = 'INVOICE'
       AND d.status  IN ('OPEN', 'PARTIAL')
       AND d.date    <= ${asOfDate}
  `

  const byCustomer = new Map<string, AgingRow>()
  const totals: Record<AgingBucket, Decimal> = {
    current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO,
  }
  let grandTotal = ZERO

  for (const row of rows) {
    const outstanding = new Decimal(row.outstanding)
    if (outstanding.lessThanOrEqualTo(0)) continue

    const bucket = bucketFor(row.days)

    const existing =
      byCustomer.get(row.customerId) ??
      {
        customerId: row.customerId,
        customerName: row.customerName,
        buckets: { current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO },
        total: ZERO,
      }

    existing.buckets[bucket] = existing.buckets[bucket].plus(outstanding)
    existing.total = existing.total.plus(outstanding)
    byCustomer.set(row.customerId, existing)

    totals[bucket] = totals[bucket].plus(outstanding)
    grandTotal = grandTotal.plus(outstanding)
  }

  // The comparison that makes the report trustworthy: does it agree with the
  // ledger? If not, the report says so rather than quietly being wrong.
  const [control] = await client.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
      JOIN ledger_accounts a ON a.id = l."accountId"
     WHERE l."orgId" = ${ctx.orgId}
       AND a."systemKey" = 'ACCOUNTS_RECEIVABLE'
       AND l."journalDate" <= ${asOfDate}
  `

  const controlBalance = new Decimal(control?.balance ?? '0')

  return {
    rows: [...byCustomer.values()].sort((a, b) => a.customerName.localeCompare(b.customerName)),
    totals,
    grandTotal,
    asOf,
    controlBalance,
    agrees: grandTotal.equals(controlBalance),
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
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
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
      select: { id: true, type: true, number: true, date: true, dueDate: true, total: true, memo: true },
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
        description: document.memo ?? labelFor(document.type),
        charge: isCharge ? total : ZERO,
        credit: isCredit ? total : ZERO,
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
