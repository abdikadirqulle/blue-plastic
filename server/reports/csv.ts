import 'server-only'

import { Decimal, toMoneyString } from '@/lib/money'

/**
 * CSV generation.
 *
 * Two things matter and nothing else does. Money is written as a plain decimal
 * string with no currency symbol and no thousands separator, because the file is
 * going into a spreadsheet where a formatted number is a text cell. And a field
 * beginning with =, +, - or @ is prefixed with an apostrophe, because Excel
 * treats those as formulas — a customer named "=cmd|..." is a real attack, not a
 * hypothetical one.
 */
export type CsvCell = string | number | Decimal | null | undefined

export function csvValue(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Decimal) return toMoneyString(cell, 2)
  return String(cell)
}

function escapeCell(cell: CsvCell): string {
  let value = csvValue(cell)

  if (/^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value)) {
    value = `'${value}`
  }

  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function toCsv(rows: CsvCell[][]): string {
  // CRLF and a BOM, so Excel opens it with the right encoding on every platform.
  return `﻿${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}\r\n`
}

export function csvResponse(filename: string, rows: CsvCell[][]): Response {
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
