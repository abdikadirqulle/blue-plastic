import type { CalendarDate } from '@/lib/date'
import { isCalendarDate, today } from '@/lib/date'
import {
  isPeriodKey,
  priorPeriod,
  priorYear,
  resolvePeriod,
  type Period,
  type PeriodKey,
} from '@/lib/report-periods'
import type { ReportBasis } from '@/server/reports/framework'

export type ComparisonKey = 'none' | 'prior-period' | 'prior-year'

export const COMPARISON_LABELS: Record<ComparisonKey, string> = {
  none: 'No comparison',
  'prior-period': 'Previous period',
  'prior-year': 'Previous year',
}

export type SearchParams = Record<string, string | string[] | undefined>

export type ReportSettings = {
  period: PeriodKey
  range: Period
  basis: ReportBasis
  comparison: ComparisonKey
  comparisonRange?: Period
  asOf: CalendarDate
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

/**
 * Every report reads its settings from the URL, so a report someone is looking
 * at can be sent to someone else and be the same report. Nothing about the view
 * is stored server-side, which also means there is no stale saved state to
 * explain when the answer changes.
 */
export function readSettings(
  query: SearchParams,
  organization: { timeZone: string; fiscalYearStartMonth: number },
  fallback: PeriodKey = 'this-fiscal-year',
): ReportSettings {
  const now = today(organization.timeZone)

  const from = one(query.from)
  const to = one(query.to)
  const custom = {
    from: from && isCalendarDate(from) ? from : undefined,
    to: to && isCalendarDate(to) ? to : undefined,
  }

  const requested = one(query.period)
  const period: PeriodKey = isPeriodKey(requested)
    ? requested
    : custom.from || custom.to
      ? 'custom'
      : fallback

  const range = resolvePeriod(period, now, organization.fiscalYearStartMonth, custom)
  const basis: ReportBasis = one(query.basis) === 'cash' ? 'cash' : 'accrual'

  const requestedComparison = one(query.compare)
  const comparison: ComparisonKey =
    requestedComparison === 'prior-period' || requestedComparison === 'prior-year'
      ? requestedComparison
      : 'none'

  const asOfParam = one(query.asOf)

  return {
    period,
    range,
    basis,
    comparison,
    comparisonRange:
      comparison === 'prior-period'
        ? priorPeriod(range)
        : comparison === 'prior-year'
          ? priorYear(range)
          : undefined,
    asOf: asOfParam && isCalendarDate(asOfParam) ? asOfParam : range.to,
  }
}

/** The settings as a query string, for export links and comparison switches. */
export function settingsToQuery(settings: ReportSettings, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    period: settings.period,
    from: settings.range.from,
    to: settings.range.to,
    basis: settings.basis,
    compare: settings.comparison,
    asOf: settings.asOf,
    ...extra,
  })
  return params.toString()
}
