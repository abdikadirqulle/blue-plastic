import {
  addDays,
  addMonths,
  endOfMonth,
  fiscalYearOf,
  fiscalYearRange,
  startOfMonth,
  type CalendarDate,
} from '@/lib/date'

/**
 * The date ranges people actually ask for.
 *
 * Kept out of the report engines because a period is a question about the
 * calendar, not about the ledger, and both the server pages and the client
 * controls need to agree on what "last quarter" means.
 */
export type PeriodKey =
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-fiscal-year'
  | 'last-fiscal-year'
  | 'year-to-date'
  | 'custom'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'last-quarter': 'Last quarter',
  'this-fiscal-year': 'This fiscal year',
  'last-fiscal-year': 'Last fiscal year',
  'year-to-date': 'Fiscal year to date',
  custom: 'Custom',
}

export type Period = { from: CalendarDate; to: CalendarDate }

function quarterOf(date: CalendarDate, fiscalYearStartMonth: number): Period {
  const month = Number(date.slice(5, 7))
  // Quarters run from the start of the fiscal year, not from January, so a
  // business whose year starts in April reports April–June as Q1.
  const offset = (month - fiscalYearStartMonth + 12) % 12
  const start = addMonths(startOfMonth(date), -(offset % 3))
  return { from: start, to: endOfMonth(addMonths(start, 2)) }
}

export function resolvePeriod(
  key: PeriodKey,
  today: CalendarDate,
  fiscalYearStartMonth: number,
  custom?: Partial<Period>,
): Period {
  const thisYear = fiscalYearRange(fiscalYearOf(today, fiscalYearStartMonth), fiscalYearStartMonth)

  switch (key) {
    case 'this-month':
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'last-month': {
      const previous = addMonths(startOfMonth(today), -1)
      return { from: previous, to: endOfMonth(previous) }
    }
    case 'this-quarter':
      return quarterOf(today, fiscalYearStartMonth)
    case 'last-quarter': {
      const current = quarterOf(today, fiscalYearStartMonth)
      const start = addMonths(current.from, -3)
      return { from: start, to: addDays(current.from, -1) }
    }
    case 'this-fiscal-year':
      return { from: thisYear.start, to: thisYear.end }
    case 'last-fiscal-year': {
      const previous = fiscalYearRange(
        fiscalYearOf(today, fiscalYearStartMonth) - 1,
        fiscalYearStartMonth,
      )
      return { from: previous.start, to: previous.end }
    }
    case 'year-to-date':
      return { from: thisYear.start, to: today }
    case 'custom':
      return { from: custom?.from ?? thisYear.start, to: custom?.to ?? today }
  }
}

/** The same length of period, immediately before it. Used for comparatives. */
export function priorPeriod(period: Period): Period {
  const from = new Date(`${period.from}T00:00:00Z`)
  const to = new Date(`${period.to}T00:00:00Z`)
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) }
}

/** The same period one year earlier, which is the comparison people expect. */
export function priorYear(period: Period): Period {
  return { from: addMonths(period.from, -12), to: addMonths(period.to, -12) }
}

export const isPeriodKey = (value: unknown): value is PeriodKey =>
  typeof value === 'string' && value in PERIOD_LABELS
