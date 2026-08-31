import { NextResponse } from 'next/server'

import { toCalendarDate } from '@/lib/date'
import { bySlug } from '@/lib/sales-types'
import { purchaseBySlug } from '@/lib/purchase-types'
import { requireOrgContext } from '@/server/auth/context'
import { isAppError } from '@/server/errors'
import { csvResponse, type CsvCell } from '@/server/reports/csv'
import * as accountService from '@/server/services/account.service'
import * as billPaymentService from '@/server/services/bill-payment.service'
import * as contactService from '@/server/services/contact.service'
import * as itemService from '@/server/services/item.service'
import * as journalService from '@/server/services/journal.service'
import * as paymentService from '@/server/services/payment.service'
import * as purchaseService from '@/server/services/purchase.service'
import * as salesService from '@/server/services/sales.service'

export const dynamic = 'force-dynamic'

/**
 * A list, as a file.
 *
 * The export takes **every row the filter matches**, not the page on screen —
 * so it asks for a page size big enough to cover the list rather than reusing
 * the screen's pagination. Exporting page 2 of 7 without saying so is the kind
 * of quiet wrongness that ends up in somebody's board pack.
 *
 * It is CSV rather than `.xlsx` because Excel opens it directly, with amounts as
 * numbers rather than text — see `server/reports/csv.ts` for why the file is
 * shaped the way it is.
 */
const ALL = { page: 1, pageSize: 5000, dir: 'asc' as const }

export async function GET(request: Request, { params }: { params: Promise<{ list: string }> }) {
  try {
    const { list } = await params
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? undefined
    const status = url.searchParams.get('status') ?? undefined
    const type = url.searchParams.get('type') ?? undefined
    const archived = url.searchParams.get('archived') === '1'
    const sort = url.searchParams.get('sort') ?? undefined
    const dir = url.searchParams.get('dir') === 'desc' ? ('desc' as const) : ('asc' as const)

    const ctx = await requireOrgContext('report:read')
    const currency = ctx.organization.baseCurrency
    const heading = (title: string): CsvCell[][] => [
      [ctx.organization.name],
      [title],
      [`Currency: ${currency}`],
      [],
    ]

    // --- Sales and purchase documents, keyed by their URL slug ---------------
    const salesConfig = bySlug(list)
    if (salesConfig) {
      const page = await salesService.list(ctx, salesConfig.type, { ...ALL, q }, { status, sort, dir })
      const rows: CsvCell[][] = heading(salesConfig.plural)
      rows.push(['Number', 'Date', 'Due', 'Customer', 'Reference', 'Status', 'Total', 'Outstanding'])
      for (const row of page.rows) {
        rows.push([
          row.number,
          toCalendarDate(row.date),
          row.dueDate ? toCalendarDate(row.dueDate) : '',
          row.customer.displayName,
          row.reference ?? '',
          row.status,
          row.total,
          row.balance,
        ])
      }
      return csvResponse(`${salesConfig.slug}.csv`, rows)
    }

    const purchaseConfig = purchaseBySlug(list)
    if (purchaseConfig) {
      const page = await purchaseService.list(ctx, purchaseConfig.type, { ...ALL, q }, { status, sort, dir })
      const rows: CsvCell[][] = heading(purchaseConfig.plural)
      rows.push(['Number', 'Date', 'Due', 'Vendor', 'Their reference', 'Status', 'Total', 'Owing'])
      for (const row of page.rows) {
        rows.push([
          row.number,
          toCalendarDate(row.date),
          row.dueDate ? toCalendarDate(row.dueDate) : '',
          row.vendor.displayName,
          row.reference ?? '',
          row.status,
          row.total,
          row.balance,
        ])
      }
      return csvResponse(`${purchaseConfig.slug}.csv`, rows)
    }

    switch (list) {
      case 'journals': {
        const page = await journalService.list(ctx, { ...ALL, q }, { sort, dir })
        const rows: CsvCell[][] = heading('Journal entries')
        rows.push([
          'Entry',
          'Date',
          'Description',
          'Source',
          'Document',
          'Customer / vendor',
          'Status',
          'Amount',
        ])
        for (const row of page.rows) {
          rows.push([
            row.journalNumber,
            toCalendarDate(row.date),
            row.memo ?? '',
            row.sourceType,
            row.source.number ?? '',
            row.source.partyName ?? '',
            row.status,
            row.total,
          ])
        }
        return csvResponse('journal-entries.csv', rows)
      }

      case 'payments': {
        const page = await paymentService.list(ctx, { ...ALL, q }, { sort, dir })
        const rows: CsvCell[][] = heading('Customer payments')
        rows.push(['Number', 'Date', 'Customer', 'Method', 'Status', 'Amount', 'Unapplied'])
        for (const row of page.rows) {
          rows.push([
            row.number,
            toCalendarDate(row.date),
            row.customer.displayName,
            row.method,
            row.status,
            row.amount,
            row.unapplied,
          ])
        }
        return csvResponse('customer-payments.csv', rows)
      }

      case 'bill-payments': {
        const page = await billPaymentService.list(ctx, { ...ALL, q }, { sort, dir })
        const rows: CsvCell[][] = heading('Bill payments')
        rows.push(['Number', 'Date', 'Vendor', 'Method', 'Status', 'Amount'])
        for (const row of page.rows) {
          rows.push([
            row.number,
            toCalendarDate(row.date),
            row.vendor.displayName,
            row.method,
            row.status,
            row.amount,
          ])
        }
        return csvResponse('bill-payments.csv', rows)
      }

      case 'customers':
      case 'vendors': {
        const page =
          list === 'customers'
            ? await contactService.listCustomers(ctx, { ...ALL, q }, { includeInactive: archived, sort, dir })
            : await contactService.listVendors(ctx, { ...ALL, q }, { includeInactive: archived, sort, dir })

        const rows: CsvCell[][] = heading(list === 'customers' ? 'Customers' : 'Vendors')
        rows.push(['Name', 'Company', 'Email', 'Phone', 'Balance', 'Active'])
        for (const row of page.rows) {
          rows.push([
            row.displayName,
            row.companyName ?? '',
            row.email ?? '',
            row.phone ?? '',
            row.balance,
            row.isActive ? 'yes' : 'no',
          ])
        }
        return csvResponse(`${list}.csv`, rows)
      }

      case 'items': {
        const page = await itemService.list(ctx, { ...ALL, q }, { includeInactive: archived, type, sort, dir })
        const rows: CsvCell[][] = heading('Products and services')
        rows.push(['Name', 'SKU', 'Type', 'Sales price', 'Purchase cost', 'Active'])
        for (const row of page.rows) {
          rows.push([
            row.name,
            row.sku ?? '',
            row.type,
            row.salesPrice ?? '',
            row.purchaseCost ?? '',
            row.isActive ? 'yes' : 'no',
          ])
        }
        return csvResponse('items.csv', rows)
      }

      case 'accounts': {
        const accounts = await accountService.list(ctx, { q, includeInactive: archived })
        const rows: CsvCell[][] = heading('Chart of accounts')
        rows.push(['Number', 'Name', 'Type', 'Detail type', 'Balance', 'Active'])
        for (const account of accounts) {
          rows.push([
            account.code,
            account.name,
            account.type,
            account.subtype,
            account.hasChildren ? '' : account.balance,
            account.isActive ? 'yes' : 'no',
          ])
        }
        return csvResponse('chart-of-accounts.csv', rows)
      }

      default:
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Unknown list.' } }, { status: 404 })
    }
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    }
    console.error('[api/exports]', error)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Request failed.' } }, { status: 500 })
  }
}
