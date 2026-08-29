'use client'

import * as React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { addMonths, startOfMonth, toCalendarDate, toDate, type CalendarDate } from '@/lib/date'
import { cn } from '@/lib/utils'

/**
 * A month grid.
 *
 * Written here rather than pulled from a date library for the same reason the
 * combobox is: what it has to be right about is the *calendar date*, not an
 * instant. Every date in this system is a `YYYY-MM-DD` string — an invoice dated
 * the 1st is dated the 1st in every timezone — and a picker built on `Date`
 * objects is one daylight-saving boundary away from posting an entry into the
 * wrong month. So the arithmetic goes through `lib/date`, which is the same code
 * the ledger uses.
 */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Days of the grid, Monday-first, padded with the neighbouring months. */
function gridFor(month: CalendarDate): { date: CalendarDate; outside: boolean }[] {
  const first = toDate(startOfMonth(month))
  // getUTCDay is 0 for Sunday; the grid starts on Monday.
  const lead = (first.getUTCDay() + 6) % 7

  const days: { date: CalendarDate; outside: boolean }[] = []
  const cursor = new Date(first)
  cursor.setUTCDate(cursor.getUTCDate() - lead)

  for (let index = 0; index < 42; index++) {
    const date = toCalendarDate(cursor)
    days.push({ date, outside: date.slice(0, 7) !== month.slice(0, 7) })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

export function Calendar({
  value,
  onSelect,
  today,
  className,
}: {
  value: CalendarDate | null
  onSelect: (date: CalendarDate) => void
  /** Marked with a ring. The organisation's today, not the browser's. */
  today?: CalendarDate
  className?: string
}) {
  const [month, setMonth] = React.useState<CalendarDate>(startOfMonth(value ?? today ?? '2026-01-01'))

  // Following the value lets a typed date move the grid without an effect.
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (value) setMonth(startOfMonth(value))
  }

  const days = gridFor(month)
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1

  return (
    <div className={cn('w-64 p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <p className="text-sm font-medium" aria-live="polite">
          {MONTH_NAMES[monthIndex]} {year}
        </p>

        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((day) => (
          <div key={day} className="grid h-7 place-items-center text-[0.6875rem] text-muted-foreground">
            {day}
          </div>
        ))}

        {days.map(({ date, outside }) => {
          const selected = date === value
          const isToday = date === today

          return (
            <button
              key={date}
              type="button"
              aria-label={date}
              aria-current={selected ? 'date' : undefined}
              onClick={() => onSelect(date)}
              className={cn(
                'grid h-8 place-items-center rounded-md text-sm tabular transition-colors',
                outside && 'text-muted-foreground/40',
                !selected && 'hover:bg-accent hover:text-accent-foreground',
                selected && 'bg-primary font-medium text-primary-foreground',
                isToday && !selected && 'ring-1 ring-inset ring-primary/40',
              )}
            >
              {Number(date.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
