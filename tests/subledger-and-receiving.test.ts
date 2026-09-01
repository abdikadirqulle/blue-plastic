import { afterAll, describe, expect, it } from 'vitest'

import { toDate } from '@/lib/date'
import { postJournal } from '@/server/accounting/posting'
import { db, type Tx } from '@/server/db'
import { aging as payablesAging } from '@/server/services/payables.service'
import { aging as receivablesAging } from '@/server/services/receivables.service'
import { receivableOrder } from '@/server/services/purchase.service'
import { CODE, inRolledBackTransaction, makeOrg, type Fixture } from './ledger-helpers'

const suite = process.env.DATABASE_URL ? describe : describe.skip

const AS_OF = '2026-06-30'

async function makeCustomer(tx: Tx, fixture: Fixture, name: string) {
  return tx.customer.create({
    data: { orgId: fixture.ctx.orgId, displayName: name },
    select: { id: true, displayName: true },
  })
}

async function makeVendor(tx: Tx, fixture: Fixture, name: string) {
  return tx.vendor.create({
    data: { orgId: fixture.ctx.orgId, displayName: name },
    select: { id: true, displayName: true },
  })
}

/**
 * The aging reports are the place where the ledger and the subledger have to
 * agree, and until now they only agreed when every receivable happened to come
 * from an open invoice. An opening balance, an unapplied payment or a
 * hand-written entry went to the control account and nowhere else, and the
 * report quietly reported a different number from the trial balance.
 */
suite('receivables aging agrees with the control account', () => {
  it('shows a balance that came from a journal rather than an invoice', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const customer = await makeCustomer(tx, fixture, 'Ahmed Trading')

      // Exactly what a customer opening balance, or a manual entry, produces:
      // a debit to receivables naming the customer, with no invoice behind it.
      await postJournal(tx, fixture.ctx, {
        date: '2026-02-01',
        memo: 'Opening balance',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.receivable], debit: '1200', customerId: customer.id },
          { accountId: fixture.accounts[CODE.openingBalanceEquity], credit: '1200' },
        ],
      })

      const report = await receivablesAging(fixture.ctx, AS_OF, { client: tx })

      expect(report.agrees).toBe(true)
      expect(report.controlBalance.toString()).toBe('1200')
      expect(report.grandTotal.toString()).toBe('1200')

      const row = report.rows.find((candidate) => candidate.customerId === customer.id)
      expect(row).toBeDefined()
      // It has no due date, so it is outstanding rather than overdue.
      expect(row!.buckets.unapplied.toString()).toBe('1200')
      expect(row!.buckets.current.toString()).toBe('0')
      expect(row!.total.toString()).toBe('1200')
    })
  })

  it('nets a write-off against the balance it was raised on', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const customer = await makeCustomer(tx, fixture, 'Slow Payer Ltd')

      await postJournal(tx, fixture.ctx, {
        date: '2026-02-01',
        memo: 'Balance brought forward',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.receivable], debit: '500', customerId: customer.id },
          { accountId: fixture.accounts[CODE.openingBalanceEquity], credit: '500' },
        ],
      })

      await postJournal(tx, fixture.ctx, {
        date: '2026-03-01',
        memo: 'Bad debt written off',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.rent], debit: '200' },
          { accountId: fixture.accounts[CODE.receivable], credit: '200', customerId: customer.id },
        ],
      })

      const report = await receivablesAging(fixture.ctx, AS_OF, { client: tx })

      expect(report.agrees).toBe(true)
      expect(report.grandTotal.toString()).toBe('300')
      expect(report.rows).toHaveLength(1)
      expect(report.rows[0].total.toString()).toBe('300')
    })
  })

  it('leaves a customer off entirely once their balance is nil', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const customer = await makeCustomer(tx, fixture, 'Settled & Co')

      await postJournal(tx, fixture.ctx, {
        date: '2026-02-01',
        memo: 'Raised',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.receivable], debit: '400', customerId: customer.id },
          { accountId: fixture.accounts[CODE.sales], credit: '400' },
        ],
      })

      await postJournal(tx, fixture.ctx, {
        date: '2026-02-20',
        memo: 'Paid',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.bank], debit: '400' },
          { accountId: fixture.accounts[CODE.receivable], credit: '400', customerId: customer.id },
        ],
      })

      const report = await receivablesAging(fixture.ctx, AS_OF, { client: tx })

      expect(report.agrees).toBe(true)
      expect(report.grandTotal.toString()).toBe('0')
      expect(report.rows).toHaveLength(0)
    })
  })
})

suite('payables aging agrees with the control account', () => {
  it('shows a vendor balance raised by journal alone', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const vendor = await makeVendor(tx, fixture, 'Karachi Polymers')

      await postJournal(tx, fixture.ctx, {
        date: '2026-02-01',
        memo: 'Opening balance',
        sourceType: 'MANUAL',
        lines: [
          { accountId: fixture.accounts[CODE.openingBalanceEquity], debit: '850' },
          { accountId: fixture.accounts[CODE.payable], credit: '850', vendorId: vendor.id },
        ],
      })

      const report = await payablesAging(fixture.ctx, AS_OF, { client: tx })

      expect(report.agrees).toBe(true)
      expect(report.grandTotal.toString()).toBe('850')
      expect(report.rows[0].buckets.unapplied.toString()).toBe('850')
    })
  })
})

/**
 * R7 is what makes all of the above possible: a control-account line that does
 * not say whose balance it moves is refused by the database itself, so the
 * subledger cannot be incomplete.
 */
suite('control accounts insist on a counterparty', () => {
  it('refuses a receivables line with no customer', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)

      await expect(
        postJournal(tx, fixture.ctx, {
          date: '2026-02-01',
          memo: 'Nameless receivable',
          sourceType: 'MANUAL',
          lines: [
            { accountId: fixture.accounts[CODE.receivable], debit: '100' },
            { accountId: fixture.accounts[CODE.sales], credit: '100' },
          ],
        }),
      ).rejects.toThrow(/must name a customer/i)
    })
  })

  it('refuses a payables line with no vendor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)

      await expect(
        postJournal(tx, fixture.ctx, {
          date: '2026-02-01',
          memo: 'Nameless payable',
          sourceType: 'MANUAL',
          lines: [
            { accountId: fixture.accounts[CODE.rent], debit: '100' },
            { accountId: fixture.accounts[CODE.payable], credit: '100' },
          ],
        }),
      ).rejects.toThrow(/must name a vendor/i)
    })
  })
})

/**
 * Receiving reads what is still to come off the order itself. The arithmetic is
 * trivial and that is the point: an order that has had three of ten delivered
 * must say seven, not "converted" or "not converted".
 */
suite('an order reports what is still to come', () => {
  async function makeOrder(
    tx: Tx,
    fixture: Fixture,
    lines: { quantity: string; received: string; unitPrice: string }[],
  ) {
    const vendor = await makeVendor(tx, fixture, 'Supplier Ltd')

    return tx.purchaseDocument.create({
      data: {
        orgId: fixture.ctx.orgId,
        type: 'PURCHASE_ORDER',
        number: `PO-${Math.random().toString(36).slice(2, 8)}`,
        vendorId: vendor.id,
        date: toDate('2026-02-01'),
        status: 'OPEN',
        currencyCode: 'USD',
        subtotal: '0',
        taxTotal: '0',
        total: '0',
        lines: {
          create: lines.map((line, index) => ({
            orgId: fixture.ctx.orgId,
            lineNumber: index + 1,
            description: `Line ${index + 1}`,
            quantity: line.quantity,
            quantityReceived: line.received,
            unitPrice: line.unitPrice,
            amount: '0',
            taxAmount: '0',
          })),
        },
      },
      select: { id: true },
    })
  }

  it('counts what remains per line', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const order = await makeOrder(tx, fixture, [
        { quantity: '10', received: '3', unitPrice: '25' },
        { quantity: '4', received: '4', unitPrice: '10' },
      ])

      const view = await receivableOrder(fixture.ctx, order.id, { client: tx })

      expect(view.lines.map((line) => line.remaining)).toEqual(['7.00', '0.00'])
      expect(view.lines.map((line) => line.received)).toEqual(['3.00', '4.00'])
      expect(view.fullyReceived).toBe(false)
    })
  })

  it('reports an order as complete once nothing is outstanding', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const order = await makeOrder(tx, fixture, [
        { quantity: '10', received: '10', unitPrice: '25' },
      ])

      const view = await receivableOrder(fixture.ctx, order.id, { client: tx })

      expect(view.fullyReceived).toBe(true)
      expect(view.lines[0].remaining).toBe('0.00')
    })
  })

  it('never reports a negative outstanding quantity', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      // Over-receipt is refused by the service, but a bill voided by hand could
      // in principle leave the count ahead of the order. It reads as complete,
      // not as owing minus two.
      const order = await makeOrder(tx, fixture, [
        { quantity: '5', received: '7', unitPrice: '25' },
      ])

      const view = await receivableOrder(fixture.ctx, order.id, { client: tx })

      expect(view.lines[0].remaining).toBe('0.00')
      expect(view.fullyReceived).toBe(true)
    })
  })
})

afterAll(async () => {
  await db.$disconnect()
})
