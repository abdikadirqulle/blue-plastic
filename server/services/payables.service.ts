import 'server-only'

import { toDate, type CalendarDate } from '@/lib/date'
import { Decimal, ZERO } from '@/lib/money'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { AGING_BUCKETS, BUCKET_LABELS, type AgingBucket } from '@/server/services/receivables.service'

export { AGING_BUCKETS, BUCKET_LABELS }

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

  const rows = await client.$queryRaw<
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
       AND d.type    = 'BILL'
       AND d.status IN ('OPEN', 'PARTIAL')
       AND d.date   <= ${asOfDate}
  `

  const byVendor = new Map<string, PayablesAgingRow>()
  const totals: Record<AgingBucket, Decimal> = {
    current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO,
  }
  let grandTotal = ZERO

  for (const row of rows) {
    const outstanding = new Decimal(row.outstanding)
    if (outstanding.lessThanOrEqualTo(0)) continue

    const bucket = bucketFor(row.days)
    const existing =
      byVendor.get(row.vendorId) ??
      {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        buckets: { current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO },
        total: ZERO,
      }

    existing.buckets[bucket] = existing.buckets[bucket].plus(outstanding)
    existing.total = existing.total.plus(outstanding)
    byVendor.set(row.vendorId, existing)

    totals[bucket] = totals[bucket].plus(outstanding)
    grandTotal = grandTotal.plus(outstanding)
  }

  // Payables are a credit balance, so the control account is read the other way up.
  const [control] = await client.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.credit - l.debit), 0) AS balance
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
      JOIN ledger_accounts a ON a.id = l."accountId"
     WHERE l."orgId" = ${ctx.orgId}
       AND a."systemKey" = 'ACCOUNTS_PAYABLE'
       AND l."journalDate" <= ${asOfDate}
  `

  const controlBalance = new Decimal(control?.balance ?? '0')

  return {
    rows: [...byVendor.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    totals,
    grandTotal,
    controlBalance,
    agrees: grandTotal.equals(controlBalance),
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
