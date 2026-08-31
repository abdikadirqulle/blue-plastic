import 'server-only'

import { toCalendarDate, toDate, type CalendarDate } from '@/lib/date'
import { Decimal, toMoneyString, ZERO } from '@/lib/money'
import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import { generalLedger } from '@/server/accounting/balances'
import { valuation } from '@/server/accounting/inventory'
import type { Tx } from '@/server/db'

/**
 * The reports that are a **table** rather than a financial statement.
 *
 * The three statements — profit and loss, balance sheet, cash flow — each have a
 * shape of their own and keep their own page. Everything else is the same
 * object: a title, a set of columns, some rows, a total row. Writing fourteen
 * near-identical pages for those would mean fourteen places for the period
 * handling, the export link and the empty state to drift apart, and the one that
 * drifts is always the one nobody opened.
 *
 * So they are declared here as data, rendered by one page and exported by one
 * route. Adding a report is adding an entry to this file.
 *
 * Every figure is read from the ledger or from the documents that produced it —
 * never from a stored total.
 */
export type ColumnFormat = 'text' | 'money' | 'number' | 'date' | 'badge'

export type ReportColumn = {
  key: string
  label: string
  format?: ColumnFormat
  /** Narrow columns keep a wide table readable. */
  width?: string
}

export type ReportCell = string | null

export type ReportRow = {
  cells: Record<string, ReportCell>
  /** Drill-down: where this row came from. */
  href?: string | null
  /** A subtotal or grouping row, rendered heavier. */
  emphasis?: boolean
}

export type ReportTable = {
  columns: ReportColumn[]
  rows: ReportRow[]
  /** Rendered as the footer. Keyed by column. */
  totals?: Record<string, ReportCell>
  /** Shown under the table — an agreement check, a caveat, a count. */
  note?: string
  /** Shown when there are no rows. */
  empty?: string
}

export type ReportContext = {
  ctx: OrgContext
  range: { from: CalendarDate; to: CalendarDate }
  asOf: CalendarDate
}

export type TableReport = {
  key: string
  title: string
  description: string
  group: string
  /** A range report covers a period; an as-of report states a position at a date. */
  mode: 'range' | 'asOf'
  build: (input: ReportContext) => Promise<ReportTable>
}

const money = (value: Decimal.Value) => toMoneyString(value, 2)
const date = (value: Date | null) => (value ? toCalendarDate(value) : null)

/* --- Customers ------------------------------------------------------------ */

const customerBalances: TableReport = {
  key: 'customer-balances',
  title: 'Customer balances',
  description: 'What every customer owes, and how much of it is overdue.',
  group: 'Customers',
  mode: 'asOf',
  async build({ ctx, asOf }) {
    const rows = await db.$queryRaw<
      {
        id: string
        name: string
        email: string | null
        outstanding: string
        overdue: string
        openCount: number
      }[]
    >`
      SELECT c.id                                   AS id,
             c."displayName"                        AS name,
             c.email                                AS email,
             COALESCE(SUM(d.total - COALESCE(a.applied, 0)), 0)  AS outstanding,
             COALESCE(SUM(CASE WHEN d."dueDate" < ${toDate(asOf)}
                               THEN d.total - COALESCE(a.applied, 0) ELSE 0 END), 0) AS overdue,
             COUNT(d.id)::int                       AS "openCount"
        FROM customers c
        JOIN sales_documents d
          ON d."customerId" = c.id
         AND d.type = 'INVOICE'
         AND d.status IN ('OPEN', 'PARTIAL')
         AND d.date <= ${toDate(asOf)}
        LEFT JOIN LATERAL (
          SELECT SUM(amount) AS applied FROM sales_applications WHERE "invoiceId" = d.id
        ) a ON true
       WHERE c."orgId" = ${ctx.orgId}
       GROUP BY c.id, c."displayName", c.email
      HAVING COALESCE(SUM(d.total - COALESCE(a.applied, 0)), 0) <> 0
       ORDER BY 4 DESC
    `

    return {
      columns: [
        { key: 'name', label: 'Customer' },
        { key: 'email', label: 'Email' },
        { key: 'openCount', label: 'Open invoices', format: 'number', width: 'w-32' },
        { key: 'overdue', label: 'Overdue', format: 'money', width: 'w-36' },
        { key: 'outstanding', label: 'Balance', format: 'money', width: 'w-36' },
      ],
      rows: rows.map((row) => ({
        href: `/reports/statements/customer?customerId=${row.id}`,
        cells: {
          name: row.name,
          email: row.email,
          openCount: String(row.openCount),
          overdue: money(row.overdue),
          outstanding: money(row.outstanding),
        },
      })),
      totals: {
        name: 'Total',
        overdue: money(rows.reduce((sum, row) => sum.plus(row.overdue), ZERO)),
        outstanding: money(rows.reduce((sum, row) => sum.plus(row.outstanding), ZERO)),
      },
      empty: 'Nobody owes anything at this date.',
      note: 'Click a customer for their statement.',
    }
  },
}

const openInvoices: TableReport = {
  key: 'open-invoices',
  title: 'Open invoices',
  description: 'Every unpaid invoice, oldest first, with what is still owed on it.',
  group: 'Customers',
  mode: 'asOf',
  async build({ ctx, asOf }) {
    const invoices = await db.salesDocument.findMany({
      where: {
        orgId: ctx.orgId,
        type: 'INVOICE',
        status: { in: ['OPEN', 'PARTIAL'] },
        date: { lte: toDate(asOf) },
      },
      select: {
        id: true, number: true, date: true, dueDate: true, total: true, reference: true,
        customer: { select: { id: true, displayName: true } },
        applications: { select: { amount: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    })

    const asOfTime = toDate(asOf).getTime()
    const rows: ReportRow[] = []
    let outstanding = ZERO

    for (const invoice of invoices) {
      const applied = invoice.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
      const balance = new Decimal(invoice.total.toString()).minus(applied)
      if (!balance.greaterThan(0)) continue
      outstanding = outstanding.plus(balance)

      const daysOverdue = invoice.dueDate
        ? Math.floor((asOfTime - invoice.dueDate.getTime()) / 86_400_000)
        : 0

      rows.push({
        href: `/sales/invoices/${invoice.id}`,
        cells: {
          number: invoice.number,
          customer: invoice.customer.displayName,
          date: date(invoice.date),
          dueDate: date(invoice.dueDate),
          overdue: daysOverdue > 0 ? `${daysOverdue} days` : null,
          total: money(invoice.total.toString()),
          paid: money(applied),
          balance: money(balance),
        },
      })
    }

    return {
      columns: [
        { key: 'number', label: 'Invoice', width: 'w-32' },
        { key: 'customer', label: 'Customer' },
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'dueDate', label: 'Due', format: 'date', width: 'w-28' },
        { key: 'overdue', label: 'Overdue', width: 'w-28' },
        { key: 'total', label: 'Total', format: 'money', width: 'w-32' },
        { key: 'paid', label: 'Paid', format: 'money', width: 'w-32' },
        { key: 'balance', label: 'Owing', format: 'money', width: 'w-32' },
      ],
      rows,
      totals: { number: 'Total', balance: money(outstanding) },
      empty: 'Every invoice is settled.',
    }
  },
}

const paymentsReceived: TableReport = {
  key: 'payments-received',
  title: 'Payments received',
  description: 'Money in from customers, with what each payment settled.',
  group: 'Customers',
  mode: 'range',
  async build({ ctx, range }) {
    const payments = await db.customerPayment.findMany({
      where: {
        orgId: ctx.orgId,
        status: { not: 'VOID' },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: {
        id: true, number: true, date: true, amount: true, method: true, reference: true,
        customer: { select: { displayName: true } },
        depositAccount: { select: { code: true, name: true } },
        applications: { select: { amount: true } },
      },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
    })

    let total = ZERO
    const rows = payments.map((payment) => {
      const applied = payment.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
      const amount = new Decimal(payment.amount.toString())
      total = total.plus(amount)
      return {
        href: '/payments',
        cells: {
          number: payment.number,
          date: date(payment.date),
          customer: payment.customer.displayName,
          method: payment.method.replace('_', ' ').toLowerCase(),
          account: `${payment.depositAccount.code} ${payment.depositAccount.name}`,
          reference: payment.reference,
          amount: money(amount),
          unapplied: money(amount.minus(applied)),
        },
      }
    })

    return {
      columns: [
        { key: 'number', label: 'Payment', width: 'w-32' },
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'customer', label: 'Customer' },
        { key: 'method', label: 'Method', width: 'w-32' },
        { key: 'account', label: 'Into' },
        { key: 'reference', label: 'Reference', width: 'w-32' },
        { key: 'amount', label: 'Amount', format: 'money', width: 'w-32' },
        { key: 'unapplied', label: 'Unapplied', format: 'money', width: 'w-32' },
      ],
      rows,
      totals: { number: 'Total', amount: money(total) },
      empty: 'No payments received in this period.',
    }
  },
}

/* --- Vendors -------------------------------------------------------------- */

const vendorBalances: TableReport = {
  key: 'vendor-balances',
  title: 'Vendor balances',
  description: 'What the business owes each vendor, and how much of it is overdue.',
  group: 'Vendors',
  mode: 'asOf',
  async build({ ctx, asOf }) {
    const rows = await db.$queryRaw<
      { id: string; name: string; email: string | null; outstanding: string; overdue: string; openCount: number }[]
    >`
      SELECT v.id                                  AS id,
             v."displayName"                       AS name,
             v.email                               AS email,
             COALESCE(SUM(d.total - COALESCE(a.applied, 0)), 0) AS outstanding,
             COALESCE(SUM(CASE WHEN d."dueDate" < ${toDate(asOf)}
                               THEN d.total - COALESCE(a.applied, 0) ELSE 0 END), 0) AS overdue,
             COUNT(d.id)::int                      AS "openCount"
        FROM vendors v
        JOIN purchase_documents d
          ON d."vendorId" = v.id
         AND d.type = 'BILL'
         AND d.status IN ('OPEN', 'PARTIAL')
         AND d.date <= ${toDate(asOf)}
        LEFT JOIN LATERAL (
          SELECT SUM(amount) AS applied FROM purchase_applications WHERE "billId" = d.id
        ) a ON true
       WHERE v."orgId" = ${ctx.orgId}
       GROUP BY v.id, v."displayName", v.email
      HAVING COALESCE(SUM(d.total - COALESCE(a.applied, 0)), 0) <> 0
       ORDER BY 4 DESC
    `

    return {
      columns: [
        { key: 'name', label: 'Vendor' },
        { key: 'email', label: 'Email' },
        { key: 'openCount', label: 'Open bills', format: 'number', width: 'w-32' },
        { key: 'overdue', label: 'Overdue', format: 'money', width: 'w-36' },
        { key: 'outstanding', label: 'Balance', format: 'money', width: 'w-36' },
      ],
      rows: rows.map((row) => ({
        href: `/reports/statements/vendor?vendorId=${row.id}`,
        cells: {
          name: row.name,
          email: row.email,
          openCount: String(row.openCount),
          overdue: money(row.overdue),
          outstanding: money(row.outstanding),
        },
      })),
      totals: {
        name: 'Total',
        overdue: money(rows.reduce((sum, row) => sum.plus(row.overdue), ZERO)),
        outstanding: money(rows.reduce((sum, row) => sum.plus(row.outstanding), ZERO)),
      },
      empty: 'Nothing is owed at this date.',
      note: 'Click a vendor for their statement.',
    }
  },
}

const unpaidBills: TableReport = {
  key: 'unpaid-bills',
  title: 'Unpaid bills',
  description: 'Everything still owed, oldest first — the list worked through on pay day.',
  group: 'Vendors',
  mode: 'asOf',
  async build({ ctx, asOf }) {
    const bills = await db.purchaseDocument.findMany({
      where: {
        orgId: ctx.orgId,
        type: 'BILL',
        status: { in: ['OPEN', 'PARTIAL'] },
        date: { lte: toDate(asOf) },
      },
      select: {
        id: true, number: true, date: true, dueDate: true, total: true, reference: true,
        vendor: { select: { id: true, displayName: true } },
        applications: { select: { amount: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    })

    const asOfTime = toDate(asOf).getTime()
    const rows: ReportRow[] = []
    let outstanding = ZERO

    for (const bill of bills) {
      const applied = bill.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
      const balance = new Decimal(bill.total.toString()).minus(applied)
      if (!balance.greaterThan(0)) continue
      outstanding = outstanding.plus(balance)

      const daysOverdue = bill.dueDate
        ? Math.floor((asOfTime - bill.dueDate.getTime()) / 86_400_000)
        : 0

      rows.push({
        href: `/purchases/bills/${bill.id}`,
        cells: {
          number: bill.number,
          vendor: bill.vendor.displayName,
          reference: bill.reference,
          date: date(bill.date),
          dueDate: date(bill.dueDate),
          overdue: daysOverdue > 0 ? `${daysOverdue} days` : null,
          total: money(bill.total.toString()),
          balance: money(balance),
        },
      })
    }

    return {
      columns: [
        { key: 'number', label: 'Bill', width: 'w-32' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'reference', label: 'Their ref', width: 'w-32' },
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'dueDate', label: 'Due', format: 'date', width: 'w-28' },
        { key: 'overdue', label: 'Overdue', width: 'w-28' },
        { key: 'total', label: 'Total', format: 'money', width: 'w-32' },
        { key: 'balance', label: 'Owing', format: 'money', width: 'w-32' },
      ],
      rows,
      totals: { number: 'Total', balance: money(outstanding) },
      empty: 'Nothing outstanding.',
    }
  },
}

const paymentsMade: TableReport = {
  key: 'payments-made',
  title: 'Payments made',
  description: 'Money out to vendors, and the account each payment left.',
  group: 'Vendors',
  mode: 'range',
  async build({ ctx, range }) {
    const payments = await db.billPayment.findMany({
      where: {
        orgId: ctx.orgId,
        status: { not: 'VOID' },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: {
        id: true, number: true, date: true, amount: true, method: true, reference: true,
        vendor: { select: { displayName: true } },
        paymentAccount: { select: { code: true, name: true } },
        applications: { select: { amount: true } },
      },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
    })

    let total = ZERO
    const rows = payments.map((payment) => {
      const applied = payment.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
      const amount = new Decimal(payment.amount.toString())
      total = total.plus(amount)
      return {
        href: '/bill-payments',
        cells: {
          number: payment.number,
          date: date(payment.date),
          vendor: payment.vendor.displayName,
          method: payment.method.replace('_', ' ').toLowerCase(),
          account: `${payment.paymentAccount.code} ${payment.paymentAccount.name}`,
          reference: payment.reference,
          bills: String(payment.applications.length),
          amount: money(amount),
          unapplied: money(amount.minus(applied)),
        },
      }
    })

    return {
      columns: [
        { key: 'number', label: 'Payment', width: 'w-32' },
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'method', label: 'Method', width: 'w-32' },
        { key: 'account', label: 'From' },
        { key: 'reference', label: 'Reference', width: 'w-32' },
        { key: 'bills', label: 'Bills', format: 'number', width: 'w-20' },
        { key: 'amount', label: 'Amount', format: 'money', width: 'w-32' },
        { key: 'unapplied', label: 'On account', format: 'money', width: 'w-32' },
      ],
      rows,
      totals: { number: 'Total', amount: money(total) },
      empty: 'No payments made in this period.',
    }
  },
}

const expensesByVendor: TableReport = {
  key: 'expenses-by-vendor',
  title: 'Expenses by vendor',
  description: 'What was spent with each vendor, net of tax, credits deducted.',
  group: 'Vendors',
  mode: 'range',
  async build({ ctx, range }) {
    const rows = await db.$queryRaw<
      { id: string; name: string; amount: string; count: number }[]
    >`
      SELECT v.id            AS id,
             v."displayName" AS name,
             COALESCE(SUM(CASE WHEN d.type = 'VENDOR_CREDIT' THEN -d.subtotal ELSE d.subtotal END), 0) AS amount,
             COUNT(d.id)::int AS count
        FROM purchase_documents d
        JOIN vendors v ON v.id = d."vendorId"
       WHERE d."orgId" = ${ctx.orgId}
         AND d.status NOT IN ('DRAFT', 'VOID')
         AND d.type IN ('BILL', 'EXPENSE', 'VENDOR_CREDIT')
         AND d.date BETWEEN ${toDate(range.from)} AND ${toDate(range.to)}
       GROUP BY v.id, v."displayName"
       ORDER BY 3 DESC
    `

    const total = rows.reduce((sum, row) => sum.plus(row.amount), ZERO)

    return {
      columns: [
        { key: 'name', label: 'Vendor' },
        { key: 'count', label: 'Documents', format: 'number', width: 'w-32' },
        { key: 'amount', label: 'Spend', format: 'money', width: 'w-36' },
        { key: 'share', label: 'Share', width: 'w-24' },
      ],
      rows: rows.map((row) => ({
        href: `/vendors/${row.id}`,
        cells: {
          name: row.name,
          count: String(row.count),
          amount: money(row.amount),
          share: total.isZero()
            ? '0.0%'
            : `${new Decimal(row.amount).dividedBy(total).times(100).toFixed(1)}%`,
        },
      })),
      totals: { name: 'Total', amount: money(total) },
      empty: 'Nothing bought in this period.',
    }
  },
}

/* --- Sales and purchases -------------------------------------------------- */

const purchasesByItem: TableReport = {
  key: 'purchases-by-item',
  title: 'Purchases by product or service',
  description: 'What was bought, by quantity and value.',
  group: 'Purchases',
  mode: 'range',
  async build({ ctx, range }) {
    const rows = await db.$queryRaw<
      { id: string; name: string; sku: string | null; amount: string; quantity: string; count: number }[]
    >`
      SELECT i.id   AS id,
             i.name AS name,
             i.sku  AS sku,
             COALESCE(SUM(CASE WHEN d.type = 'VENDOR_CREDIT' THEN -l.amount ELSE l.amount END), 0) AS amount,
             COALESCE(SUM(CASE WHEN d.type = 'VENDOR_CREDIT' THEN -l.quantity ELSE l.quantity END), 0) AS quantity,
             COUNT(DISTINCT d.id)::int AS count
        FROM purchase_document_lines l
        JOIN purchase_documents d ON d.id = l."documentId"
        JOIN items i ON i.id = l."itemId"
       WHERE d."orgId" = ${ctx.orgId}
         AND d.status NOT IN ('DRAFT', 'VOID')
         AND d.type IN ('BILL', 'EXPENSE', 'VENDOR_CREDIT')
         AND d.date BETWEEN ${toDate(range.from)} AND ${toDate(range.to)}
       GROUP BY i.id, i.name, i.sku
       ORDER BY 4 DESC
    `

    const total = rows.reduce((sum, row) => sum.plus(row.amount), ZERO)

    return {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU', width: 'w-32' },
        { key: 'count', label: 'Documents', format: 'number', width: 'w-28' },
        { key: 'quantity', label: 'Quantity', format: 'number', width: 'w-28' },
        { key: 'amount', label: 'Cost', format: 'money', width: 'w-36' },
      ],
      rows: rows.map((row) => ({
        href: `/inventory/${row.id}`,
        cells: {
          name: row.name,
          sku: row.sku,
          count: String(row.count),
          quantity: new Decimal(row.quantity).toFixed(2),
          amount: money(row.amount),
        },
      })),
      totals: { name: 'Total', amount: money(total) },
      empty: 'Nothing bought against an item in this period.',
    }
  },
}

const productProfitability: TableReport = {
  key: 'product-profitability',
  title: 'Product profitability',
  description:
    'Income against cost of goods sold, item by item — the margin each product actually earned.',
  group: 'Sales',
  mode: 'range',
  async build({ ctx, range }) {
    // Income comes from the sales lines; cost comes from the stock ledger, which
    // is what was actually issued and at what average. Taking the cost from the
    // item's purchase price instead would report a margin nobody earned.
    const income = await db.$queryRaw<
      { id: string; name: string; sku: string | null; amount: string; quantity: string }[]
    >`
      SELECT i.id AS id, i.name AS name, i.sku AS sku,
             COALESCE(SUM(CASE WHEN d.type IN ('CREDIT_MEMO', 'REFUND_RECEIPT') THEN -l.amount ELSE l.amount END), 0) AS amount,
             COALESCE(SUM(CASE WHEN d.type IN ('CREDIT_MEMO', 'REFUND_RECEIPT') THEN -l.quantity ELSE l.quantity END), 0) AS quantity
        FROM sales_document_lines l
        JOIN sales_documents d ON d.id = l."documentId"
        JOIN items i ON i.id = l."itemId"
       WHERE d."orgId" = ${ctx.orgId}
         AND d.status NOT IN ('DRAFT', 'VOID')
         AND d.type IN ('INVOICE', 'SALES_RECEIPT', 'CREDIT_MEMO', 'REFUND_RECEIPT')
         AND d.date BETWEEN ${toDate(range.from)} AND ${toDate(range.to)}
       GROUP BY i.id, i.name, i.sku
    `

    const cost = await db.$queryRaw<{ id: string; value: string }[]>`
      SELECT t."itemId" AS id,
             COALESCE(-SUM(t.value), 0) AS value
        FROM inventory_transactions t
       WHERE t."orgId" = ${ctx.orgId}
         AND t.type IN ('SALE', 'SALE_RETURN')
         AND t.date BETWEEN ${toDate(range.from)} AND ${toDate(range.to)}
       GROUP BY t."itemId"
    `

    const costById = new Map(cost.map((row) => [row.id, new Decimal(row.value)]))

    let totalIncome = ZERO
    let totalCost = ZERO

    const rows = income
      .map((row) => {
        const revenue = new Decimal(row.amount)
        const cogs = costById.get(row.id) ?? ZERO
        const margin = revenue.minus(cogs)
        totalIncome = totalIncome.plus(revenue)
        totalCost = totalCost.plus(cogs)
        return {
          href: `/inventory/${row.id}`,
          margin,
          cells: {
            name: row.name,
            sku: row.sku,
            quantity: new Decimal(row.quantity).toFixed(2),
            income: money(revenue),
            cost: money(cogs),
            profit: money(margin),
            percent: revenue.isZero()
              ? '—'
              : `${margin.dividedBy(revenue).times(100).toFixed(1)}%`,
          },
        }
      })
      .sort((a, b) => b.margin.comparedTo(a.margin))
      .map(({ href, cells }) => ({ href, cells }))

    const totalMargin = totalIncome.minus(totalCost)

    return {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU', width: 'w-32' },
        { key: 'quantity', label: 'Sold', format: 'number', width: 'w-24' },
        { key: 'income', label: 'Income', format: 'money', width: 'w-32' },
        { key: 'cost', label: 'Cost of sales', format: 'money', width: 'w-32' },
        { key: 'profit', label: 'Gross profit', format: 'money', width: 'w-32' },
        { key: 'percent', label: 'Margin', width: 'w-24' },
      ],
      rows,
      totals: {
        name: 'Total',
        income: money(totalIncome),
        cost: money(totalCost),
        profit: money(totalMargin),
        percent: totalIncome.isZero()
          ? '—'
          : `${totalMargin.dividedBy(totalIncome).times(100).toFixed(1)}%`,
      },
      note: 'Cost is what the stock ledger actually issued, at weighted-average cost. Services and non-inventory products show no cost, because none was tracked.',
      empty: 'Nothing sold against an item in this period.',
    }
  },
}

/* --- Inventory ------------------------------------------------------------ */

const stockValuation: TableReport = {
  key: 'inventory-valuation',
  title: 'Stock valuation',
  description: 'What is on hand and what it is worth, item by item.',
  group: 'Inventory',
  mode: 'asOf',
  async build({ ctx }) {
    const stock = await valuation(db as unknown as Tx, ctx.orgId)

    return {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU', width: 'w-32' },
        { key: 'quantity', label: 'On hand', format: 'number', width: 'w-28' },
        { key: 'cost', label: 'Average cost', format: 'money', width: 'w-32' },
        { key: 'value', label: 'Value', format: 'money', width: 'w-32' },
        { key: 'price', label: 'Sales price', format: 'money', width: 'w-32' },
      ],
      rows: stock.items.map((item) => ({
        href: `/inventory/${item.itemId}`,
        cells: {
          name: item.name,
          sku: item.sku,
          quantity: item.quantity.toFixed(2),
          cost: money(item.averageCost),
          value: money(item.value),
          price: item.salesPrice ? money(item.salesPrice) : null,
        },
      })),
      totals: { name: 'Total', value: money(stock.totalValue) },
      note:
        'Stock is valued as the stock ledger holds it *now*, not as at a past date — ' +
        'the movement chain carries its running position on each row, so a historical ' +
        'valuation would mean walking it back rather than reading it. This total must ' +
        'equal the Inventory Asset account; the Inventory screen says whether it does.',
      empty: 'No tracked products yet.',
    }
  },
}

const stockMovements: TableReport = {
  key: 'inventory-movements',
  title: 'Stock movements',
  description: 'Every movement of stock in the period, and what it did to the value.',
  group: 'Inventory',
  mode: 'range',
  async build({ ctx, range }) {
    const movements = await db.inventoryTransaction.findMany({
      where: {
        orgId: ctx.orgId,
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: {
        id: true, date: true, type: true, quantity: true, unitCost: true, value: true,
        runningQuantity: true, sourceType: true,
        item: { select: { id: true, name: true, sku: true } },
        journal: { select: { id: true, journalNumber: true } },
      },
      orderBy: [{ date: 'asc' }, { sequence: 'asc' }],
      take: 2000,
    })

    let net = ZERO

    return {
      columns: [
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'item', label: 'Item' },
        { key: 'type', label: 'Movement', width: 'w-32' },
        { key: 'entry', label: 'Entry', width: 'w-28' },
        { key: 'quantity', label: 'Quantity', format: 'number', width: 'w-28' },
        { key: 'cost', label: 'Unit cost', format: 'money', width: 'w-28' },
        { key: 'value', label: 'Value', format: 'money', width: 'w-32' },
        { key: 'onHand', label: 'On hand after', format: 'number', width: 'w-32' },
      ],
      rows: movements.map((movement) => {
        net = net.plus(movement.value.toString())
        return {
          href: movement.journal ? `/journals/${movement.journal.id}` : `/inventory/${movement.item.id}`,
          cells: {
            date: date(movement.date),
            item: movement.item.sku ? `${movement.item.sku} — ${movement.item.name}` : movement.item.name,
            type: movement.type.replace('_', ' ').toLowerCase(),
            entry: movement.journal?.journalNumber ?? null,
            quantity: new Decimal(movement.quantity.toString()).toFixed(2),
            cost: money(movement.unitCost.toString()),
            value: money(movement.value.toString()),
            onHand: new Decimal(movement.runningQuantity.toString()).toFixed(2),
          },
        }
      }),
      totals: { date: 'Net change in stock value', value: money(net) },
      empty: 'No stock moved in this period.',
    }
  },
}

const reorder: TableReport = {
  key: 'inventory-reorder',
  title: 'Reorder list',
  description: 'Products at or below their reorder point.',
  group: 'Inventory',
  mode: 'asOf',
  async build({ ctx }) {
    const stock = await valuation(db as unknown as Tx, ctx.orgId)
    const low = stock.items.filter((item) => item.belowReorder)

    return {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU', width: 'w-32' },
        { key: 'quantity', label: 'On hand', format: 'number', width: 'w-28' },
        { key: 'reorderPoint', label: 'Reorder at', format: 'number', width: 'w-28' },
        { key: 'shortfall', label: 'Short by', format: 'number', width: 'w-28' },
        { key: 'cost', label: 'Average cost', format: 'money', width: 'w-32' },
      ],
      // Reorder is a question about now, so the date control does not apply.
      rows: low.map((item) => ({
        href: `/inventory/${item.itemId}`,
        cells: {
          name: item.name,
          sku: item.sku,
          quantity: item.quantity.toFixed(2),
          reorderPoint: item.reorderPoint?.toFixed(2) ?? null,
          shortfall: item.reorderPoint ? item.reorderPoint.minus(item.quantity).toFixed(2) : null,
          cost: money(item.averageCost),
        },
      })),
      empty: 'Nothing needs reordering.',
    }
  },
}

/* --- Accounting ----------------------------------------------------------- */

const generalLedgerReport: TableReport = {
  key: 'general-ledger',
  title: 'General ledger',
  description: 'Every posted line, account by account, with a running balance.',
  group: 'Accounting',
  mode: 'range',
  async build({ ctx, range }) {
    const accounts = await db.ledgerAccount.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    })

    const rows: ReportRow[] = []

    for (const account of accounts) {
      const ledger = await generalLedger(ctx.orgId, account.id, range, { limit: 500 })
      if (ledger.entries.length === 0 && ledger.opening.isZero()) continue

      rows.push({
        emphasis: true,
        href: `/accounts/${account.id}`,
        cells: {
          date: null,
          account: `${account.code} — ${account.name}`,
          entry: null,
          description: 'Opening balance',
          debit: null,
          credit: null,
          balance: money(ledger.opening),
        },
      })

      for (const entry of ledger.entries) {
        rows.push({
          href: `/journals/${entry.journalId}`,
          cells: {
            date: date(entry.date),
            account: null,
            entry: entry.journalNumber,
            description: entry.description ?? entry.memo ?? entry.contraAccounts,
            debit: entry.debit.isZero() ? null : money(entry.debit),
            credit: entry.credit.isZero() ? null : money(entry.credit),
            balance: money(entry.balance),
          },
        })
      }

      rows.push({
        emphasis: true,
        cells: {
          date: null,
          account: null,
          entry: null,
          description: `Closing balance — ${account.code} ${account.name}`,
          debit: null,
          credit: null,
          balance: money(ledger.closing),
        },
      })
    }

    return {
      columns: [
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'account', label: 'Account' },
        { key: 'entry', label: 'Entry', width: 'w-28' },
        { key: 'description', label: 'Description' },
        { key: 'debit', label: 'Debit', format: 'money', width: 'w-32' },
        { key: 'credit', label: 'Credit', format: 'money', width: 'w-32' },
        { key: 'balance', label: 'Balance', format: 'money', width: 'w-32' },
      ],
      rows,
      note: 'Balances are shown on each account’s natural side. Up to 500 entries per account.',
      empty: 'Nothing posted in this period.',
    }
  },
}

const journalReport: TableReport = {
  key: 'journal-report',
  title: 'Journal report',
  description: 'Every entry in the period with both sides, the document and the party.',
  group: 'Accounting',
  mode: 'range',
  async build({ ctx, range }) {
    const journals = await db.journal.findMany({
      where: {
        orgId: ctx.orgId,
        status: { not: 'DRAFT' },
        date: { gte: toDate(range.from), lte: toDate(range.to) },
      },
      select: {
        id: true, journalNumber: true, date: true, memo: true, sourceType: true, status: true,
        lines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            id: true, debit: true, credit: true, description: true,
            account: { select: { code: true, name: true } },
            customer: { select: { displayName: true } },
            vendor: { select: { displayName: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { journalNumber: 'asc' }],
      take: 500,
    })

    const rows: ReportRow[] = []
    let totalDebit = ZERO

    for (const journal of journals) {
      for (const [index, line] of journal.lines.entries()) {
        totalDebit = totalDebit.plus(line.debit.toString())
        rows.push({
          href: `/journals/${journal.id}`,
          cells: {
            date: index === 0 ? date(journal.date) : null,
            entry: index === 0 ? journal.journalNumber : null,
            source: index === 0 ? journal.sourceType.replace('_', ' ').toLowerCase() : null,
            account: `${line.account.code} — ${line.account.name}`,
            party: line.customer?.displayName ?? line.vendor?.displayName ?? null,
            description: line.description ?? journal.memo,
            debit: line.debit.toString() === '0' ? null : money(line.debit.toString()),
            credit: line.credit.toString() === '0' ? null : money(line.credit.toString()),
          },
        })
      }
    }

    return {
      columns: [
        { key: 'date', label: 'Date', format: 'date', width: 'w-28' },
        { key: 'entry', label: 'Entry', width: 'w-28' },
        { key: 'source', label: 'Source', width: 'w-32' },
        { key: 'account', label: 'Account' },
        { key: 'party', label: 'Customer / vendor', width: 'w-44' },
        { key: 'description', label: 'Description' },
        { key: 'debit', label: 'Debit', format: 'money', width: 'w-32' },
        { key: 'credit', label: 'Credit', format: 'money', width: 'w-32' },
      ],
      rows,
      totals: { date: 'Total', debit: money(totalDebit), credit: money(totalDebit) },
      note: 'Debits and credits are equal by construction — the ledger refuses anything else.',
      empty: 'Nothing posted in this period.',
    }
  },
}

const accountBalances: TableReport = {
  key: 'account-balances',
  title: 'Account balances',
  description: 'Every account with its opening balance, movement and closing balance.',
  group: 'Accounting',
  mode: 'range',
  async build({ ctx, range }) {
    const rows = await db.$queryRaw<
      {
        id: string
        code: string
        name: string
        type: string
        subtype: string
        opening: string
        movement: string
        closing: string
      }[]
    >`
      SELECT a.id AS id, a.code AS code, a.name AS name,
             a.type::text AS type, a.subtype::text AS subtype,
             COALESCE(SUM(CASE WHEN l."journalDate" < ${toDate(range.from)} THEN l.debit - l.credit ELSE 0 END), 0) AS opening,
             COALESCE(SUM(CASE WHEN l."journalDate" BETWEEN ${toDate(range.from)} AND ${toDate(range.to)} THEN l.debit - l.credit ELSE 0 END), 0) AS movement,
             COALESCE(SUM(CASE WHEN l."journalDate" <= ${toDate(range.to)} THEN l.debit - l.credit ELSE 0 END), 0) AS closing
        FROM ledger_accounts a
        LEFT JOIN journal_lines l ON l."accountId" = a.id AND l."orgId" = a."orgId"
        LEFT JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
       WHERE a."orgId" = ${ctx.orgId}
         AND (l.id IS NULL OR j.id IS NOT NULL)
       GROUP BY a.id, a.code, a.name, a.type, a.subtype
       ORDER BY a.code
    `

    // Presented on the natural side, so income reads positive.
    const natural = (type: string, raw: string) =>
      type === 'ASSET' || type === 'EXPENSE' ? new Decimal(raw) : new Decimal(raw).negated()

    return {
      columns: [
        { key: 'code', label: 'Code', width: 'w-24' },
        { key: 'name', label: 'Account' },
        { key: 'type', label: 'Type', width: 'w-32' },
        { key: 'opening', label: 'Opening', format: 'money', width: 'w-32' },
        { key: 'movement', label: 'Movement', format: 'money', width: 'w-32' },
        { key: 'closing', label: 'Closing', format: 'money', width: 'w-32' },
      ],
      rows: rows.map((row) => ({
        href: `/accounts/${row.id}`,
        cells: {
          code: row.code,
          name: row.name,
          type: row.type.toLowerCase(),
          opening: money(natural(row.type, row.opening)),
          movement: money(natural(row.type, row.movement)),
          closing: money(natural(row.type, row.closing)),
        },
      })),
      empty: 'No accounts yet.',
      note: 'Balances are shown on each account’s natural side.',
    }
  },
}

/* --- The catalogue -------------------------------------------------------- */

export const TABLE_REPORTS: TableReport[] = [
  customerBalances,
  openInvoices,
  paymentsReceived,
  vendorBalances,
  unpaidBills,
  paymentsMade,
  expensesByVendor,
  purchasesByItem,
  productProfitability,
  stockValuation,
  stockMovements,
  reorder,
  generalLedgerReport,
  journalReport,
  accountBalances,
]

export const tableReport = (key: string): TableReport | undefined =>
  TABLE_REPORTS.find((report) => report.key === key)
