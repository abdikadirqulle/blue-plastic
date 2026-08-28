import type { PaymentTermType } from '@prisma/client'

import { addDays, addMonths, endOfMonth, startOfMonth, type CalendarDate } from './date'

export type PaymentTermShape = {
  type: PaymentTermType
  dueDays: number
  discountDays?: number | null
  discountPercent?: string | number | null
}

/**
 * When a document falls due.
 *
 * Computed from the document's own date, never from today — a back-dated invoice
 * is overdue the moment it is entered, and pretending otherwise hides real debt
 * from the aging report.
 */
export function dueDateFor(documentDate: CalendarDate, term: PaymentTermShape | null): CalendarDate {
  if (!term) return documentDate

  switch (term.type) {
    case 'DUE_ON_RECEIPT':
      return documentDate

    case 'NET_DAYS':
      return addDays(documentDate, Math.max(0, term.dueDays))

    case 'DAY_OF_MONTH': {
      // "Due on the 15th": the 15th of this month if that has not passed,
      // otherwise the 15th of next month.
      const day = Math.min(Math.max(term.dueDays, 1), 31)
      const thisMonth = clampToMonth(startOfMonth(documentDate), day)
      if (thisMonth >= documentDate) return thisMonth
      return clampToMonth(addMonths(startOfMonth(documentDate), 1), day)
    }

    default:
      return documentDate
  }
}

/** The last day a settlement discount can still be taken, if the term offers one. */
export function discountDateFor(
  documentDate: CalendarDate,
  term: PaymentTermShape | null,
): CalendarDate | null {
  if (!term?.discountDays || !term.discountPercent) return null
  if (Number(term.discountPercent) <= 0) return null
  return addDays(documentDate, term.discountDays)
}

/** A day-of-month term must land on a day the month actually has. */
function clampToMonth(monthStart: CalendarDate, day: number): CalendarDate {
  const last = Number(endOfMonth(monthStart).slice(8, 10))
  return `${monthStart.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`
}

export function describeTerm(term: PaymentTermShape & { name?: string }): string {
  switch (term.type) {
    case 'DUE_ON_RECEIPT':
      return 'Due on receipt'
    case 'NET_DAYS':
      return `Net ${term.dueDays} days`
    case 'DAY_OF_MONTH':
      return `Due on the ${ordinal(term.dueDays)} of the month`
    default:
      return term.name ?? ''
  }
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** The terms every new organisation starts with. */
export const DEFAULT_PAYMENT_TERMS: {
  name: string
  type: PaymentTermType
  dueDays: number
  isDefault?: boolean
}[] = [
  { name: 'Due on receipt', type: 'DUE_ON_RECEIPT', dueDays: 0 },
  { name: 'Net 7', type: 'NET_DAYS', dueDays: 7 },
  { name: 'Net 15', type: 'NET_DAYS', dueDays: 15 },
  { name: 'Net 30', type: 'NET_DAYS', dueDays: 30, isDefault: true },
  { name: 'Net 60', type: 'NET_DAYS', dueDays: 60 },
]
