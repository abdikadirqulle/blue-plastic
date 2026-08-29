import { afterAll, describe, expect, it } from 'vitest'

import { toDate } from '@/lib/date'
import { postJournal } from '@/server/accounting/posting'
import { db, type Tx } from '@/server/db'
import {
  expensesByCategory,
  purchasesByVendor,
  salesByCustomer,
  salesByItem,
  taxSummary,
} from '@/server/reports/business'
import { CODE, inRolledBackTransaction, makeOrg, type Fixture } from './ledger-helpers'

const suite = process.env.DATABASE_URL ? describe : describe.skip

const RANGE = { from: '2026-01-01', to: '2026-12-31' }

type LineInput = {
  amount: string
  taxAmount?: string
  taxCodeId?: string
  itemId?: string
  quantity?: string
}

/**
 * Documents are written straight into the tables here rather than through the
 * service, because the service opens its own transaction and these tests run
 * inside one that is always rolled back. The database's own totals trigger still
 * fires, so a document that does not add up is still refused.
 */
async function makeSalesDocument(
  tx: Tx,
  fixture: Fixture,
  input: {
    type: 'INVOICE' | 'CREDIT_MEMO' | 'SALES_RECEIPT'
    customerId: string
    date: string
    number: string
    lines: LineInput[]
    status?: 'OPEN' | 'DRAFT' | 'PAID'
  },
) {
  const subtotal = input.lines.reduce((sum, line) => sum + Number(line.amount), 0)
  const taxTotal = input.lines.reduce((sum, line) => sum + Number(line.taxAmount ?? '0'), 0)

  return tx.salesDocument.create({
    data: {
      orgId: fixture.ctx.orgId,
      type: input.type,
      number: input.number,
      customerId: input.customerId,
      date: toDate(input.date),
      status: input.status ?? 'OPEN',
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      currencyCode: 'USD',
      depositAccountId: input.type === 'SALES_RECEIPT' ? fixture.accounts[CODE.bank] : null,
      lines: {
        create: input.lines.map((line, index) => ({
          orgId: fixture.ctx.orgId,
          lineNumber: index + 1,
          itemId: line.itemId,
          quantity: line.quantity ?? '1',
          unitPrice: line.amount,
          amount: line.amount,
          taxCodeId: line.taxCodeId,
          taxAmount: line.taxAmount ?? '0',
        })),
      },
    },
    select: { id: true },
  })
}

async function makePurchaseDocument(
  tx: Tx,
  fixture: Fixture,
  input: {
    type: 'BILL' | 'EXPENSE' | 'VENDOR_CREDIT'
    vendorId: string
    date: string
    number: string
    lines: LineInput[]
  },
) {
  const subtotal = input.lines.reduce((sum, line) => sum + Number(line.amount), 0)
  const taxTotal = input.lines.reduce((sum, line) => sum + Number(line.taxAmount ?? '0'), 0)

  return tx.purchaseDocument.create({
    data: {
      orgId: fixture.ctx.orgId,
      type: input.type,
      number: input.number,
      vendorId: input.vendorId,
      date: toDate(input.date),
      status: 'OPEN',
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      currencyCode: 'USD',
      paymentAccountId: input.type === 'EXPENSE' ? fixture.accounts[CODE.bank] : null,
      lines: {
        create: input.lines.map((line, index) => ({
          orgId: fixture.ctx.orgId,
          lineNumber: index + 1,
          amount: line.amount,
          taxCodeId: line.taxCodeId,
          taxAmount: line.taxAmount ?? '0',
          expenseAccountId: fixture.accounts[CODE.utilities],
        })),
      },
    },
    select: { id: true },
  })
}

suite('sales by customer', () => {
  it('ranks customers and nets credit memos off', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId

      const [big, small] = await Promise.all([
        tx.customer.create({ data: { orgId, displayName: 'Hodan Trading' }, select: { id: true } }),
        tx.customer.create({ data: { orgId, displayName: 'Barwaaqo Retail' }, select: { id: true } }),
      ])

      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: big.id, date: '2026-03-01', number: 'INV-1',
        lines: [{ amount: '1000', taxAmount: '150' }],
      })
      await makeSalesDocument(tx, fixture, {
        type: 'CREDIT_MEMO', customerId: big.id, date: '2026-03-10', number: 'CM-1',
        lines: [{ amount: '200', taxAmount: '30' }],
      })
      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: small.id, date: '2026-03-05', number: 'INV-2',
        lines: [{ amount: '400' }],
      })

      const report = await salesByCustomer(orgId, RANGE, { client: tx })

      expect(report.rows).toHaveLength(2)
      // Net of tax, and net of the credit memo: 1000 − 200.
      expect(report.rows[0].name).toBe('Hodan Trading')
      expect(report.rows[0].amount.toString()).toBe('800')
      expect(report.rows[1].amount.toString()).toBe('400')
      expect(report.total.toString()).toBe('1200')
      // Shares are of the total, so they add to 100.
      expect(report.rows[0].share.plus(report.rows[1].share).toString()).toBe('100')
    })
  })

  it('ignores drafts and anything outside the range', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId
      const customer = await tx.customer.create({
        data: { orgId, displayName: 'Hodan Trading' },
        select: { id: true },
      })

      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2026-03-01', number: 'INV-1',
        status: 'DRAFT', lines: [{ amount: '5000' }],
      })
      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2025-12-31', number: 'INV-2',
        lines: [{ amount: '900' }],
      })

      const report = await salesByCustomer(orgId, RANGE, { client: tx })
      expect(report.rows).toHaveLength(0)
      expect(report.total.toString()).toBe('0')
    })
  })
})

suite('sales by item', () => {
  it('reports value and quantity, net of returns', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId

      const customer = await tx.customer.create({
        data: { orgId, displayName: 'Hodan Trading' },
        select: { id: true },
      })
      const item = await tx.item.create({
        data: {
          orgId,
          name: 'Blue crate',
          type: 'NON_INVENTORY',
          incomeAccountId: fixture.accounts[CODE.sales],
        },
        select: { id: true },
      })

      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2026-04-01', number: 'INV-1',
        lines: [{ amount: '600', quantity: '6', itemId: item.id }],
      })
      await makeSalesDocument(tx, fixture, {
        type: 'CREDIT_MEMO', customerId: customer.id, date: '2026-04-08', number: 'CM-1',
        lines: [{ amount: '100', quantity: '1', itemId: item.id }],
      })

      const report = await salesByItem(orgId, RANGE, { client: tx })

      expect(report.rows).toHaveLength(1)
      expect(report.rows[0].amount.toString()).toBe('500')
      expect(report.rows[0].quantity.toString()).toBe('5')
    })
  })
})

suite('purchases by vendor', () => {
  it('nets vendor credits off, and reads net of tax', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId

      const vendor = await tx.vendor.create({
        data: { orgId, displayName: 'Plastics Supply Co' },
        select: { id: true },
      })

      await makePurchaseDocument(tx, fixture, {
        type: 'BILL', vendorId: vendor.id, date: '2026-05-01', number: 'BILL-1',
        lines: [{ amount: '2000', taxAmount: '300' }],
      })
      await makePurchaseDocument(tx, fixture, {
        type: 'VENDOR_CREDIT', vendorId: vendor.id, date: '2026-05-09', number: 'VC-1',
        lines: [{ amount: '500', taxAmount: '75' }],
      })

      const report = await purchasesByVendor(orgId, RANGE, { client: tx })
      expect(report.rows[0].amount.toString()).toBe('1500')
    })
  })
})

suite('expenses by category', () => {
  it('reads the ledger, so it counts entries made by hand as well as bills', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const { ctx, accounts } = fixture

      await postJournal(tx, ctx, {
        date: '2026-06-01', memo: 'Rent', sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '3000' },
          { accountId: accounts[CODE.bank], credit: '3000' },
        ],
      })
      await postJournal(tx, ctx, {
        date: '2026-06-02', memo: 'Power', sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.utilities], debit: '450' },
          { accountId: accounts[CODE.bank], credit: '450' },
        ],
      })

      const report = await expensesByCategory(ctx.orgId, RANGE, { client: tx })

      expect(report.rows).toHaveLength(2)
      expect(report.rows[0].amount.toString()).toBe('3000')
      expect(report.rows[0].share.toString()).toBe('87') // 3000 / 3450
      expect(report.total.toString()).toBe('3450')
    })
  })

  it('leaves out accounts that moved and came back to zero', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const { ctx, accounts } = fixture

      await postJournal(tx, ctx, {
        date: '2026-06-01', memo: 'Rent', sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '3000' },
          { accountId: accounts[CODE.bank], credit: '3000' },
        ],
      })
      await postJournal(tx, ctx, {
        date: '2026-06-05', memo: 'Rent refunded', sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.bank], debit: '3000' },
          { accountId: accounts[CODE.rent], credit: '3000' },
        ],
      })

      const report = await expensesByCategory(ctx.orgId, RANGE, { client: tx })
      expect(report.rows).toHaveLength(0)
    })
  })
})

suite('tax summary', () => {
  /** A code carrying two rates, which is where a naive split goes wrong. */
  async function makeTwoRateCode(tx: Tx, fixture: Fixture) {
    const orgId = fixture.ctx.orgId

    const agency = await tx.taxAgency.create({
      data: { orgId, name: 'Revenue Authority' },
      select: { id: true },
    })
    const [federal, local] = await Promise.all([
      tx.taxRate.create({
        data: { orgId, name: 'Federal 10%', rate: '0.10', agencyId: agency.id },
        select: { id: true },
      }),
      tx.taxRate.create({
        data: { orgId, name: 'Local 5%', rate: '0.05', agencyId: agency.id },
        select: { id: true },
      }),
    ])

    const code = await tx.taxCode.create({
      data: {
        orgId,
        name: 'Standard 15%',
        components: {
          create: [
            { orgId, taxRateId: federal.id, sequence: 1, isCompound: false },
            { orgId, taxRateId: local.id, sequence: 2, isCompound: false },
          ],
        },
      },
      select: { id: true },
    })

    return { code: code.id, federal: federal.id, local: local.id }
  }

  it('splits one line of tax back across the rates that made it', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId
      const { code, federal, local } = await makeTwoRateCode(tx, fixture)

      const customer = await tx.customer.create({
        data: { orgId, displayName: 'Hodan Trading' },
        select: { id: true },
      })

      // 1,000 at 15% is 150 of tax stored on the line as a single figure.
      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2026-07-01', number: 'INV-1',
        lines: [{ amount: '1000', taxAmount: '150', taxCodeId: code }],
      })

      const report = await taxSummary(orgId, RANGE, { client: tx })

      expect(report.rows).toHaveLength(2)
      const federalRow = report.rows.find((row) => row.rateId === federal)!
      const localRow = report.rows.find((row) => row.rateId === local)!

      expect(federalRow.salesTax.toString()).toBe('100')
      expect(localRow.salesTax.toString()).toBe('50')
      // Each rate saw the same 1,000 of taxable sales — the net is not split.
      expect(federalRow.salesNet.toString()).toBe('1000')
      expect(localRow.salesNet.toString()).toBe('1000')
      // And the parts add back to what was actually charged.
      expect(federalRow.salesTax.plus(localRow.salesTax).toString()).toBe('150')
      expect(report.totalNet.toString()).toBe('150')
    })
  })

  it('offsets tax paid on purchases against tax collected on sales', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId
      const { code, federal } = await makeTwoRateCode(tx, fixture)

      const [customer, vendor] = await Promise.all([
        tx.customer.create({ data: { orgId, displayName: 'Hodan Trading' }, select: { id: true } }),
        tx.vendor.create({ data: { orgId, displayName: 'Plastics Supply Co' }, select: { id: true } }),
      ])

      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2026-07-01', number: 'INV-1',
        lines: [{ amount: '1000', taxAmount: '150', taxCodeId: code }],
      })
      await makePurchaseDocument(tx, fixture, {
        type: 'BILL', vendorId: vendor.id, date: '2026-07-02', number: 'BILL-1',
        lines: [{ amount: '400', taxAmount: '60', taxCodeId: code }],
      })

      const report = await taxSummary(orgId, RANGE, { client: tx })
      const federalRow = report.rows.find((row) => row.rateId === federal)!

      expect(federalRow.salesTax.toString()).toBe('100')
      expect(federalRow.purchaseTax.toString()).toBe('40')
      expect(federalRow.net.toString()).toBe('60')
      // 150 collected less 60 reclaimable.
      expect(report.totalNet.toString()).toBe('90')
    })
  })

  it('subtracts a credit memo from what is owed', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const orgId = fixture.ctx.orgId
      const { code } = await makeTwoRateCode(tx, fixture)

      const customer = await tx.customer.create({
        data: { orgId, displayName: 'Hodan Trading' },
        select: { id: true },
      })

      await makeSalesDocument(tx, fixture, {
        type: 'INVOICE', customerId: customer.id, date: '2026-07-01', number: 'INV-1',
        lines: [{ amount: '1000', taxAmount: '150', taxCodeId: code }],
      })
      await makeSalesDocument(tx, fixture, {
        type: 'CREDIT_MEMO', customerId: customer.id, date: '2026-07-20', number: 'CM-1',
        lines: [{ amount: '400', taxAmount: '60', taxCodeId: code }],
      })

      const report = await taxSummary(orgId, RANGE, { client: tx })
      expect(report.totalNet.toString()).toBe('90')
    })
  })
})

afterAll(async () => {
  await db.$disconnect()
})
