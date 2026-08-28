import { describe, expect, it } from 'vitest'

import { describeTerm, discountDateFor, dueDateFor } from './payment-terms'

describe('due dates', () => {
  it('makes a due-on-receipt document due the day it is dated', () => {
    expect(dueDateFor('2026-03-15', { type: 'DUE_ON_RECEIPT', dueDays: 0 })).toBe('2026-03-15')
  })

  it('adds the net days to the document date, not to today', () => {
    // A back-dated invoice is already overdue; pretending otherwise hides real
    // debt from the aging report.
    expect(dueDateFor('2026-03-15', { type: 'NET_DAYS', dueDays: 30 })).toBe('2026-04-14')
    expect(dueDateFor('2026-01-01', { type: 'NET_DAYS', dueDays: 7 })).toBe('2026-01-08')
  })

  it('crosses month and year boundaries', () => {
    expect(dueDateFor('2026-12-20', { type: 'NET_DAYS', dueDays: 30 })).toBe('2027-01-19')
    expect(dueDateFor('2024-02-01', { type: 'NET_DAYS', dueDays: 29 })).toBe('2024-03-01')
  })

  it('uses this month for a day-of-month term that has not passed', () => {
    expect(dueDateFor('2026-03-10', { type: 'DAY_OF_MONTH', dueDays: 15 })).toBe('2026-03-15')
  })

  it('rolls a day-of-month term into next month once the day has passed', () => {
    expect(dueDateFor('2026-03-20', { type: 'DAY_OF_MONTH', dueDays: 15 })).toBe('2026-04-15')
  })

  it('clamps a day-of-month term to a day the month actually has', () => {
    // "Due on the 31st" in February is the 28th, not the 3rd of March.
    expect(dueDateFor('2026-02-01', { type: 'DAY_OF_MONTH', dueDays: 31 })).toBe('2026-02-28')
    expect(dueDateFor('2024-02-01', { type: 'DAY_OF_MONTH', dueDays: 31 })).toBe('2024-02-29')
  })

  it('falls back to the document date when no term is set', () => {
    expect(dueDateFor('2026-03-15', null)).toBe('2026-03-15')
  })
})

describe('settlement discounts', () => {
  it('dates the discount from the document', () => {
    expect(
      discountDateFor('2026-03-15', {
        type: 'NET_DAYS',
        dueDays: 30,
        discountDays: 10,
        discountPercent: '2',
      }),
    ).toBe('2026-03-25')
  })

  it('offers nothing when the term has no discount', () => {
    expect(discountDateFor('2026-03-15', { type: 'NET_DAYS', dueDays: 30 })).toBeNull()
    expect(
      discountDateFor('2026-03-15', {
        type: 'NET_DAYS',
        dueDays: 30,
        discountDays: 10,
        discountPercent: '0',
      }),
    ).toBeNull()
  })
})

describe('descriptions', () => {
  it('reads the way an accountant says it', () => {
    expect(describeTerm({ type: 'NET_DAYS', dueDays: 30 })).toBe('Net 30 days')
    expect(describeTerm({ type: 'DUE_ON_RECEIPT', dueDays: 0 })).toBe('Due on receipt')
    expect(describeTerm({ type: 'DAY_OF_MONTH', dueDays: 1 })).toBe('Due on the 1st of the month')
    expect(describeTerm({ type: 'DAY_OF_MONTH', dueDays: 2 })).toBe('Due on the 2nd of the month')
    expect(describeTerm({ type: 'DAY_OF_MONTH', dueDays: 3 })).toBe('Due on the 3rd of the month')
    expect(describeTerm({ type: 'DAY_OF_MONTH', dueDays: 11 })).toBe('Due on the 11th of the month')
    expect(describeTerm({ type: 'DAY_OF_MONTH', dueDays: 21 })).toBe('Due on the 21st of the month')
  })
})
