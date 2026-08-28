/**
 * A small, strict CSV reader.
 *
 * Deliberately not a dependency: the job is to read a file a person exported from
 * a spreadsheet, and the whole surface is quoted fields, escaped quotes, embedded
 * newlines and a possible BOM. Anything a full parser adds beyond that would be
 * behaviour nobody asked for on a file nobody can re-check.
 */
export type CsvRow = Record<string, string>

export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const records: string[][] = []

  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((h) => normaliseHeader(h))

  const rows = nonEmpty.slice(1).map((cells) => {
    const row: CsvRow = {}
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim()
    })
    return row
  })

  return { headers, rows }
}

/**
 * Match headers the way a person would: case, spaces and punctuation are noise.
 * "Display Name", "display_name" and "DisplayName" are the same column.
 */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export type ImportIssue = { row: number; field?: string; message: string }

export type ImportOutcome<T> = {
  valid: { row: number; data: T }[]
  issues: ImportIssue[]
  total: number
}

/** Read the first present alias, so a file does not have to use our exact wording. */
export function pick(row: CsvRow, ...aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[normaliseHeader(alias)]
    if (value !== undefined && value !== '') return value
  }
  return ''
}
