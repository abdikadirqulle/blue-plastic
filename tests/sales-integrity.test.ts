import { afterAll, describe, expect, it } from 'vitest'

import { Decimal } from '@/lib/money'
import { db } from '@/server/db'
import { CODE, inRolledBackTransaction, makeOrg, type Fixture } from './ledger-helpers'
import type { Tx } from '@/server/db'

const suite = process.env.DATABASE_URL ? describe : describe.skip

/**
 * The sales guards, attacked directly through the tables. As with the ledger
 * rules, the services check first because they can explain themselves; these
 * prove the database refuses regardless.
 */
async function makeInvoice(
  tx: Tx,
  fixture: Fixture,
  options: { total?: string; status?: string; type?: string } = {},
) {
  const total = options.total ?? '1000'
  const customer = await tx.customer.create({
    data: { orgId: fixture.ctx.orgId, displayName: `Customer ${Math.random().toString(36).slice(2, 8)}` },
    select: { id: true },
  })

  const document = await tx.salesDocument.create({
    data: {
      orgId: fixture.ctx.orgId,
      type: (options.type ?? 'INVOICE') as 'INVOICE',
      number: `INV-${Math.random().toString(36).slice(2, 8)}`,
      customerId: customer.id,
      date: new Date('2026-03-01T00:00:00Z'),
      dueDate: new Date('2026-03-31T00:00:00Z'),
      status: (options.status ?? 'OPEN') as 'OPEN',
      subtotal: total,
      taxTotal: '0',
      total,
      currencyCode: 'USD',
      lines: {
        create: [
          {
            orgId: fixture.ctx.orgId,
            lineNumber: 1,
            description: 'Goods',
            quantity: '1',
            unitPrice: total,
            amount: total,
            taxAmount: '0',
            incomeAccount: { connect: { id: fixture.accounts[CODE.sales] } },
          },
        ],
      },
    },
    select: { id: true, number: true, customerId: true },
  })

  return document
}

async function makePayment(tx: Tx, fixture: Fixture, customerId: string, amount: string) {
  return tx.customerPayment.create({
    data: {
      orgId: fixture.ctx.orgId,
      number: `PMT-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      date: new Date('2026-03-10T00:00:00Z'),
      amount,
      depositAccountId: fixture.accounts[CODE.bank],
      currencyCode: 'USD',
    },
    select: { id: true },
  })
}

suite('an application has exactly one source', () => {
  it('refuses one with neither a payment nor a credit', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture)

      // Raw SQL on purpose: the Prisma client refuses this shape before the
      // database sees it, and it is the database's refusal being tested.
      //
      // Two guards cover this row. The BEFORE INSERT trigger looks for the
      // payment or credit and finds neither, so it raises before the CHECK is
      // evaluated. Either refusal is the right outcome.
      await expect(
        tx.$executeRaw`
          INSERT INTO sales_applications (id, "orgId", "invoiceId", amount)
          VALUES ('app-neither', ${fixture.ctx.orgId}, ${invoice.id}, 100)
        `,
      ).rejects.toThrow(/sales_applications_one_source|violates check|does not exist/i)
    })
  })

  it('refuses one with both a payment and a credit', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture)
      const payment = await makePayment(tx, fixture, invoice.customerId, '500')
      const credit = await makeInvoice(tx, fixture, { type: 'CREDIT_MEMO', total: '500' })

      // Counted twice by whichever query looked first.
      await expect(
        tx.$executeRaw`
          INSERT INTO sales_applications (id, "orgId", "paymentId", "creditDocumentId", "invoiceId", amount)
          VALUES ('app-both', ${fixture.ctx.orgId}, ${payment.id}, ${credit.id}, ${invoice.id}, 100)
        `,
      ).rejects.toThrow(/sales_applications_one_source|violates check/i)
    })
  })

  it('refuses a negative or zero application', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture)
      const payment = await makePayment(tx, fixture, invoice.customerId, '500')

      await expect(
        tx.salesApplication.create({
          data: { orgId: fixture.ctx.orgId, paymentId: payment.id, invoiceId: invoice.id, amount: '0' },
        }),
      ).rejects.toThrow(/sales_applications_positive|violates check/i)
    })
  })
})

suite('nothing is settled beyond its value', () => {
  it('refuses to over-apply an invoice', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture, { total: '1000' })
      const payment = await makePayment(tx, fixture, invoice.customerId, '5000')

      await tx.salesApplication.create({
        data: { orgId: fixture.ctx.orgId, paymentId: payment.id, invoiceId: invoice.id, amount: '1000' },
      })

      const second = await makePayment(tx, fixture, invoice.customerId, '500')
      await expect(
        tx.salesApplication.create({
          data: { orgId: fixture.ctx.orgId, paymentId: second.id, invoiceId: invoice.id, amount: '1' },
        }),
      ).rejects.toThrow(/already has|would settle/i)
    })
  })

  it('refuses to apply more of a payment than the payment is worth', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture, { total: '5000' })
      const payment = await makePayment(tx, fixture, invoice.customerId, '100')

      await expect(
        tx.salesApplication.create({
          data: { orgId: fixture.ctx.orgId, paymentId: payment.id, invoiceId: invoice.id, amount: '200' },
        }),
      ).rejects.toThrow(/is worth|cannot come out of it/i)
    })
  })

  it('allows a partial payment, and then the rest', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture, { total: '1000' })
      const first = await makePayment(tx, fixture, invoice.customerId, '400')
      const second = await makePayment(tx, fixture, invoice.customerId, '600')

      await tx.salesApplication.create({
        data: { orgId: fixture.ctx.orgId, paymentId: first.id, invoiceId: invoice.id, amount: '400' },
      })
      await tx.salesApplication.create({
        data: { orgId: fixture.ctx.orgId, paymentId: second.id, invoiceId: invoice.id, amount: '600' },
      })

      const applied = await tx.salesApplication.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      })
      expect(new Decimal(applied._sum.amount!.toString()).toString()).toBe('1000')
    })
  })
})

suite('only an open invoice can be settled', () => {
  it('refuses to settle an estimate', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const estimate = await makeInvoice(tx, fixture, { type: 'ESTIMATE' })
      const payment = await makePayment(tx, fixture, estimate.customerId, '100')

      await expect(
        tx.salesApplication.create({
          data: { orgId: fixture.ctx.orgId, paymentId: payment.id, invoiceId: estimate.id, amount: '100' },
        }),
      ).rejects.toThrow(/only an invoice can be settled/i)
    })
  })

  it('refuses to settle a draft', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const draft = await makeInvoice(tx, fixture, { status: 'DRAFT' })
      const payment = await makePayment(tx, fixture, draft.customerId, '100')

      await expect(
        tx.salesApplication.create({
          data: { orgId: fixture.ctx.orgId, paymentId: payment.id, invoiceId: draft.id, amount: '100' },
        }),
      ).rejects.toThrow(/draft invoice cannot be settled/i)
    })
  })
})

suite('documents add up', () => {
  it('refuses a posted document whose total disagrees with its lines', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture, { total: '1000' })

      // Claim a bigger total than the lines support.
      await tx.$executeRaw`UPDATE sales_documents SET total = 9999, subtotal = 9999 WHERE id = ${invoice.id}`

      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
        /subtotal of .* but its lines total/i,
      )
    })
  })

  it('refuses a document that does not add up internally', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const invoice = await makeInvoice(tx, fixture, { total: '1000' })

      await tx.$executeRaw`UPDATE sales_documents SET "taxTotal" = 50 WHERE id = ${invoice.id}`

      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
        /has tax of .* but its lines total|does not add up/i,
      )
    })
  })

  it('refuses a negative total — that would be a credit memo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const customer = await tx.customer.create({
        data: { orgId: fixture.ctx.orgId, displayName: 'Negative Co' },
        select: { id: true },
      })

      await expect(
        tx.salesDocument.create({
          data: {
            orgId: fixture.ctx.orgId,
            type: 'INVOICE',
            number: 'INV-NEG',
            customerId: customer.id,
            date: new Date('2026-03-01T00:00:00Z'),
            subtotal: '-100',
            total: '-100',
            currencyCode: 'USD',
          },
        }),
      ).rejects.toThrow(/sales_documents_non_negative|violates check/i)
    })
  })

  it('refuses a posted receipt with nowhere for the money to go', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const customer = await tx.customer.create({
        data: { orgId: fixture.ctx.orgId, displayName: 'Cash Buyer' },
        select: { id: true },
      })

      await expect(
        tx.salesDocument.create({
          data: {
            orgId: fixture.ctx.orgId,
            type: 'SALES_RECEIPT',
            number: 'SR-1',
            customerId: customer.id,
            date: new Date('2026-03-01T00:00:00Z'),
            status: 'OPEN',
            subtotal: '100',
            total: '100',
            currencyCode: 'USD',
          },
        }),
      ).rejects.toThrow(/sales_documents_deposit_required|violates check/i)
    })
  })
})

suite('tenancy', () => {
  it('refuses an application against another organisation\'s invoice', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await makeOrg(tx)
      const b = await makeOrg(tx)

      const foreignInvoice = await makeInvoice(tx, b)
      const customerA = await tx.customer.create({
        data: { orgId: a.ctx.orgId, displayName: 'Ours' },
        select: { id: true },
      })
      const payment = await makePayment(tx, a, customerA.id, '100')

      await expect(
        tx.salesApplication.create({
          data: {
            orgId: a.ctx.orgId,
            paymentId: payment.id,
            invoiceId: foreignInvoice.id,
            amount: '100',
          },
        }),
      ).rejects.toThrow(/sales_applications_invoice_org_fkey|foreign key/i)
    })
  })
})

afterAll(async () => {
  await db.$disconnect()
})
