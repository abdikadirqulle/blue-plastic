import 'server-only'
import type { PeriodStatus } from '@prisma/client'

import { addMonths, endOfMonth, fiscalYearOf, fiscalYearRange, toDate, type CalendarDate } from '@/lib/date'
import type { Tx } from '@/server/db'
import { precondition } from '@/server/errors'

export type ResolvedPeriod = {
  id: string
  fiscalYearId: string
  periodNumber: number
  startDate: Date
  endDate: Date
  status: PeriodStatus
}

/**
 * Find the accounting period a date belongs to, creating the fiscal year and its
 * periods on first use.
 *
 * Generating lazily rather than asking a user to "open the year" removes a whole
 * class of support problem: nobody can be blocked from entering a transaction
 * because an administrative step was skipped. Closing a period is still a
 * deliberate act — it is only *opening* that happens by itself.
 */
export async function resolvePeriod(
  tx: Tx,
  orgId: string,
  fiscalYearStartMonth: number,
  date: CalendarDate,
): Promise<ResolvedPeriod> {
  const existing = await findPeriod(tx, orgId, date)
  if (existing) return existing

  await ensureFiscalYear(tx, orgId, fiscalYearStartMonth, fiscalYearOf(date, fiscalYearStartMonth))

  const created = await findPeriod(tx, orgId, date)
  if (!created) {
    throw precondition(`No accounting period could be created for ${date}.`)
  }
  return created
}

async function findPeriod(tx: Tx, orgId: string, date: CalendarDate): Promise<ResolvedPeriod | null> {
  return tx.accountingPeriod.findFirst({
    where: { orgId, startDate: { lte: toDate(date) }, endDate: { gte: toDate(date) } },
    select: {
      id: true,
      fiscalYearId: true,
      periodNumber: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  })
}

/**
 * Create a fiscal year and its thirteen periods if it does not exist.
 *
 * Period 0 is a single day, the day before the year opens. Opening balances land
 * there so they never sit inside a trading month and distort it — the January
 * profit and loss should show January's trading, not the balances the business
 * carried in with.
 */
export async function ensureFiscalYear(
  tx: Tx,
  orgId: string,
  fiscalYearStartMonth: number,
  year: number,
): Promise<{ id: string; year: number; created: boolean }> {
  const existing = await tx.fiscalYear.findUnique({
    where: { orgId_year: { orgId, year } },
    select: { id: true, year: true },
  })
  if (existing) return { ...existing, created: false }

  const { start, end } = fiscalYearRange(year, fiscalYearStartMonth)

  const fiscalYear = await tx.fiscalYear.create({
    data: {
      orgId,
      year,
      startDate: toDate(start),
      endDate: toDate(end),
      periods: {
        create: [
          {
            orgId,
            periodNumber: 0,
            startDate: toDate(dayBefore(start)),
            endDate: toDate(dayBefore(start)),
          },
          ...Array.from({ length: 12 }, (_, index) => {
            const monthStart = addMonths(start, index)
            return {
              orgId,
              periodNumber: index + 1,
              startDate: toDate(monthStart),
              endDate: toDate(endOfMonth(monthStart)),
            }
          }),
        ],
      },
    },
    select: { id: true, year: true },
  })

  return { ...fiscalYear, created: true }
}

function dayBefore(date: CalendarDate): CalendarDate {
  const d = toDate(date)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** The earliest date that can still be posted to, or null if every period is open. */
export async function earliestOpenDate(tx: Tx, orgId: string): Promise<Date | null> {
  const period = await tx.accountingPeriod.findFirst({
    where: { orgId, status: 'OPEN' },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  })
  return period?.startDate ?? null
}
