import 'server-only'

import { type CsvRow, type ImportIssue, parseCsv, pick } from '@/lib/csv'
import { customerSchema, vendorSchema } from '@/lib/validation/master-data'
import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import * as contactService from '@/server/services/contact.service'

export type ImportPreview = {
  total: number
  ready: number
  skipped: number
  issues: ImportIssue[]
  sample: { row: number; displayName: string; email: string; balance: string }[]
}

export type ImportResult = ImportPreview & { imported: number }

/**
 * Import customers or vendors from a spreadsheet export.
 *
 * The import is **all-or-nothing per row and never partial per file**: every row
 * is validated first, and only the ones that pass are written, inside one
 * transaction. A half-finished import of a customer list is worse than none,
 * because nobody can tell which half.
 *
 * Rows that name someone who already exists are skipped rather than merged.
 * Guessing that two similar names are the same person is how a subledger gets
 * two balances for one customer.
 */
export async function importContacts(
  ctx: OrgContext,
  side: 'customer' | 'vendor',
  csv: string,
  options: { dryRun?: boolean } = {},
): Promise<ImportResult> {
  const { rows } = parseCsv(csv)
  const issues: ImportIssue[] = []
  const schema = side === 'customer' ? customerSchema : vendorSchema

  const existing = new Set(
    (side === 'customer'
      ? await db.customer.findMany({ where: { orgId: ctx.orgId }, select: { displayName: true } })
      : await db.vendor.findMany({ where: { orgId: ctx.orgId }, select: { displayName: true } })
    ).map((r) => r.displayName.toLowerCase()),
  )

  const terms = await db.paymentTerm.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, name: true },
  })
  const termByName = new Map(terms.map((t) => [t.name.toLowerCase(), t.id]))

  const seenInFile = new Set<string>()
  const valid: { row: number; data: Record<string, unknown> }[] = []

  rows.forEach((row, index) => {
    const lineNumber = index + 2 // header is line 1, and people count from 1

    const displayName = pick(row, 'displayName', 'name', 'customer', 'vendor', 'company')
    if (!displayName) {
      issues.push({ row: lineNumber, field: 'displayName', message: 'No name in this row' })
      return
    }

    const key = displayName.toLowerCase()
    if (existing.has(key)) {
      issues.push({ row: lineNumber, message: `"${displayName}" already exists — skipped` })
      return
    }
    if (seenInFile.has(key)) {
      issues.push({ row: lineNumber, message: `"${displayName}" appears more than once in this file` })
      return
    }

    const termName = pick(row, 'paymentTerms', 'terms', 'paymentTerm')
    const paymentTermId = termName ? termByName.get(termName.toLowerCase()) : undefined
    if (termName && !paymentTermId) {
      issues.push({
        row: lineNumber,
        field: 'paymentTerms',
        message: `Unknown payment term "${termName}" — the contact will be imported without one`,
      })
    }

    const parsed = schema.safeParse(shapeRow(row, displayName, paymentTermId ?? ''))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          row: lineNumber,
          field: issue.path.join('.') || undefined,
          message: issue.message,
        })
      }
      return
    }

    seenInFile.add(key)
    valid.push({ row: lineNumber, data: parsed.data })
  })

  const preview: ImportPreview = {
    total: rows.length,
    ready: valid.length,
    skipped: rows.length - valid.length,
    issues: issues.slice(0, 100),
    sample: valid.slice(0, 10).map((entry) => ({
      row: entry.row,
      displayName: String(entry.data.displayName ?? ''),
      email: String(entry.data.email ?? ''),
      balance: String(entry.data.openingBalance ?? ''),
    })),
  }

  if (options.dryRun) return { ...preview, imported: 0 }

  let imported = 0
  for (const entry of valid) {
    // Each contact is its own transaction because an opening balance posts a
    // journal, and one bad row must not take a good one's journal with it.
    if (side === 'customer') {
      await contactService.createCustomer(ctx, entry.data as never)
    } else {
      await contactService.createVendor(ctx, entry.data as never)
    }
    imported += 1
  }

  return { ...preview, imported }
}

/** Map spreadsheet columns onto the schema, accepting the names people actually use. */
function shapeRow(row: CsvRow, displayName: string, paymentTermId: string) {
  return {
    displayName,
    companyName: pick(row, 'companyName', 'company', 'organisation', 'organization'),
    firstName: pick(row, 'firstName', 'first'),
    lastName: pick(row, 'lastName', 'last', 'surname'),
    email: pick(row, 'email', 'emailAddress'),
    phone: pick(row, 'phone', 'telephone', 'tel'),
    mobile: pick(row, 'mobile', 'cell'),
    taxRegistrationNumber: pick(row, 'taxRegistrationNumber', 'taxId', 'vatNumber', 'tin'),
    billingLine1: pick(row, 'billingLine1', 'address', 'address1', 'street'),
    billingLine2: pick(row, 'billingLine2', 'address2'),
    billingCity: pick(row, 'billingCity', 'city', 'town'),
    billingRegion: pick(row, 'billingRegion', 'state', 'region', 'province'),
    billingPostalCode: pick(row, 'billingPostalCode', 'postalCode', 'zip', 'postcode'),
    billingCountry: pick(row, 'billingCountry', 'country'),
    paymentTermId,
    notes: pick(row, 'notes', 'note', 'comment'),
    creditLimit: pick(row, 'creditLimit', 'limit'),
    openingBalance: pick(row, 'openingBalance', 'balance', 'outstanding'),
    openingBalanceDate: pick(row, 'openingBalanceDate', 'balanceDate', 'asOf'),
    defaultExpenseAccountId: '',
    shippingLine1: pick(row, 'shippingLine1', 'shippingAddress'),
    shippingLine2: pick(row, 'shippingLine2'),
    shippingCity: pick(row, 'shippingCity'),
    shippingRegion: pick(row, 'shippingRegion'),
    shippingPostalCode: pick(row, 'shippingPostalCode'),
    shippingCountry: pick(row, 'shippingCountry'),
  }
}

/** The columns an import understands, shown next to the upload box. */
export const IMPORT_COLUMNS = [
  { name: 'Display name', required: true, aliases: 'name, customer, vendor, company' },
  { name: 'Company name', required: false, aliases: 'organisation' },
  { name: 'Email', required: false, aliases: '' },
  { name: 'Phone', required: false, aliases: 'telephone, tel' },
  { name: 'Address / Address 2', required: false, aliases: 'street, billing line 1' },
  { name: 'City / State / Postal code / Country', required: false, aliases: 'town, region, zip' },
  { name: 'Tax registration number', required: false, aliases: 'tax id, VAT number, TIN' },
  { name: 'Payment terms', required: false, aliases: 'must match a term you have set up' },
  { name: 'Opening balance', required: false, aliases: 'balance, outstanding' },
  { name: 'Opening balance date', required: false, aliases: 'as of' },
]
