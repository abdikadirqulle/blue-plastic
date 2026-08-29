import 'server-only'

import { toCalendarDate, type CalendarDate } from '@/lib/date'
import { closeYear, closingPreview, reopenYear, type ClosingPreview } from '@/server/accounting/close'
import { closeChecklist } from '@/server/accounting/close-checklist'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import { notFound } from '@/server/errors'

export { closeChecklist }

/** The closing entry a year-end would post, without posting it. */
export async function previewClose(ctx: OrgContext, fiscalYearId: string): Promise<ClosingPreview> {
  return db.$transaction((tx) => closingPreview(tx, ctx, fiscalYearId))
}

export async function closeFiscalYear(ctx: OrgContext, fiscalYearId: string) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const result = await closeYear(tx, ctx, fiscalYearId)

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'FiscalYear',
        entityId: fiscalYearId,
        action: 'CLOSE_PERIOD',
        after: {
          year: result.preview.year,
          netIncome: result.preview.netIncome.toString(),
          closingJournal: result.journal?.journalNumber ?? null,
          periodsLocked: result.periodsLocked,
        },
      },
      meta,
    )

    return {
      year: result.preview.year,
      journalNumber: result.journal?.journalNumber ?? null,
      netIncome: result.preview.netIncome.toString(),
    }
  })
}

export async function reopenFiscalYear(ctx: OrgContext, fiscalYearId: string, reason: string) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const result = await reopenYear(tx, ctx, fiscalYearId, reason)

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'FiscalYear',
        entityId: fiscalYearId,
        action: 'REOPEN_PERIOD',
        after: { reversalJournal: result.reversal?.journalNumber ?? null, reason },
      },
      meta,
    )

    return { reversalJournal: result.reversal?.journalNumber ?? null }
  })
}

export type ClosePeriodTarget = {
  id: string
  label: string
  from: CalendarDate
  to: CalendarDate
}

/**
 * The earliest period still open — the only one that can be closed next, since
 * periods close in order.
 */
export async function nextPeriodToClose(ctx: OrgContext): Promise<ClosePeriodTarget | null> {
  const period = await db.accountingPeriod.findFirst({
    where: { orgId: ctx.orgId, status: 'OPEN' },
    orderBy: { startDate: 'asc' },
    select: {
      id: true,
      periodNumber: true,
      startDate: true,
      endDate: true,
      fiscalYear: { select: { year: true } },
    },
  })
  if (!period) return null

  return {
    id: period.id,
    label:
      period.periodNumber === 0
        ? `Opening balances, fiscal year ${period.fiscalYear.year}`
        : period.startDate.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    from: toCalendarDate(period.startDate),
    to: toCalendarDate(period.endDate),
  }
}

export async function periodById(ctx: OrgContext, periodId: string): Promise<ClosePeriodTarget> {
  const period = await db.accountingPeriod.findFirst({
    where: { id: periodId, orgId: ctx.orgId },
    select: {
      id: true,
      periodNumber: true,
      startDate: true,
      endDate: true,
      fiscalYear: { select: { year: true } },
    },
  })
  if (!period) throw notFound('Accounting period')

  return {
    id: period.id,
    label:
      period.periodNumber === 0
        ? `Opening balances, fiscal year ${period.fiscalYear.year}`
        : period.startDate.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    from: toCalendarDate(period.startDate),
    to: toCalendarDate(period.endDate),
  }
}
