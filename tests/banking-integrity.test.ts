import { afterAll, describe, expect, it } from 'vitest'

import { postJournal } from '@/server/accounting/posting'
import { db, type Tx } from '@/server/db'
import { CODE, inRolledBackTransaction, makeOrg, type Fixture } from './ledger-helpers'

const suite = process.env.DATABASE_URL ? describe : describe.skip

async function postBankEntry(tx: Tx, fixture: Fixture, amount: string, date = '2026-03-05') {
  const posted = await postJournal(tx, fixture.ctx, {
    date,
    sourceType: 'MANUAL',
    lines: [
      { accountId: fixture.accounts[CODE.bank], debit: amount },
      { accountId: fixture.accounts[CODE.sales], credit: amount },
    ],
  })
  const line = await tx.journalLine.findFirstOrThrow({
    where: { journalId: posted.id, accountId: fixture.accounts[CODE.bank] },
    select: { id: true },
  })
  return line.id
}

suite('transfers', () => {
  it('refuses a transfer to the same account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      // It would net to nothing, balance perfectly, and be invisible everywhere.
      await expect(
        tx.bankTransfer.create({
          data: {
            orgId: fixture.ctx.orgId,
            number: 'TRF-SAME',
            date: new Date('2026-03-01T00:00:00Z'),
            fromAccountId: fixture.accounts[CODE.bank],
            toAccountId: fixture.accounts[CODE.bank],
            amount: '100',
            currencyCode: 'USD',
          },
        }),
      ).rejects.toThrow(/bank_transfers_distinct_accounts|violates check/i)
    })
  })

  it('refuses a zero or negative transfer', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      await expect(
        tx.bankTransfer.create({
          data: {
            orgId: fixture.ctx.orgId,
            number: 'TRF-ZERO',
            date: new Date('2026-03-01T00:00:00Z'),
            fromAccountId: fixture.accounts[CODE.bank],
            toAccountId: fixture.accounts[CODE.cash],
            amount: '0',
            currencyCode: 'USD',
          },
        }),
      ).rejects.toThrow(/bank_transfers_positive|violates check/i)
    })
  })
})

suite('deposit lines', () => {
  it('refuses a line that is neither a payment nor an account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const deposit = await tx.deposit.create({
        data: {
          orgId: fixture.ctx.orgId,
          number: 'DEP-1',
          date: new Date('2026-03-01T00:00:00Z'),
          bankAccountId: fixture.accounts[CODE.bank],
          total: '100',
          currencyCode: 'USD',
        },
        select: { id: true },
      })

      await expect(
        tx.$executeRaw`
          INSERT INTO deposit_lines (id, "depositId", "orgId", "lineNumber", amount)
          VALUES ('dl-neither', ${deposit.id}, ${fixture.ctx.orgId}, 1, 100)
        `,
      ).rejects.toThrow(/deposit_lines_one_source|violates check/i)
    })
  })

  it('refuses a deposit whose total disagrees with its lines', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      await tx.deposit.create({
        data: {
          orgId: fixture.ctx.orgId,
          number: 'DEP-2',
          date: new Date('2026-03-01T00:00:00Z'),
          bankAccountId: fixture.accounts[CODE.bank],
          total: '999',
          currencyCode: 'USD',
          lines: {
            create: [
              {
                orgId: fixture.ctx.orgId,
                lineNumber: 1,
                amount: '100',
                account: { connect: { id: fixture.accounts[CODE.sales] } },
              },
            ],
          },
        },
      })

      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
        /totals .* but its lines add up to/i,
      )
    })
  })
})

suite('reconciliation', () => {
  it('refuses to clear a line from a different account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const bankLineId = await postBankEntry(tx, fixture, '250')

      // A reconciliation of Cash on Hand cannot clear a line on the bank account,
      // or it could "balance" against money that was never in it.
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.cash],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '0',
        },
        select: { id: true },
      })

      await expect(
        tx.reconciliationEntry.create({
          data: {
            orgId: fixture.ctx.orgId,
            reconciliationId: reconciliation.id,
            journalLineId: bankLineId,
          },
        }),
      ).rejects.toThrow(/different account from the one being reconciled/i)
    })
  })

  it('refuses a second reconciliation in progress on the same account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)

      await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '100',
          beginningBalance: '0',
        },
      })

      await expect(
        tx.bankReconciliation.create({
          data: {
            orgId: fixture.ctx.orgId,
            accountId: fixture.accounts[CODE.bank],
            statementDate: new Date('2026-04-30T00:00:00Z'),
            statementEndingBalance: '200',
            beginningBalance: '0',
          },
        }),
      ).rejects.toThrow(/reconciliations_one_in_progress|unique/i)
    })
  })

  it('refuses to clear a line twice', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const lineId = await postBankEntry(tx, fixture, '250')

      // Entries are added while it is in progress, then it is completed — which
      // is the only order the locking trigger permits, and the real workflow.
      const first = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '0',
        },
        select: { id: true },
      })
      await tx.reconciliationEntry.create({
        data: { orgId: fixture.ctx.orgId, reconciliationId: first.id, journalLineId: lineId },
      })
      await tx.bankReconciliation.update({
        where: { id: first.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })

      const second = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-04-30T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '250',
        },
        select: { id: true },
      })

      await expect(
        tx.reconciliationEntry.create({
          data: { orgId: fixture.ctx.orgId, reconciliationId: second.id, journalLineId: lineId },
        }),
      ).rejects.toThrow(/unique|journalLineId/i)
    })
  })

  it('locks a completed reconciliation against change', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)

      const reconciliation = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '0',
          status: 'COMPLETED',
        },
        select: { id: true },
      })

      await expect(
        tx.bankReconciliation.update({
          where: { id: reconciliation.id },
          data: { statementEndingBalance: '9999' },
        }),
      ).rejects.toThrow(/complete and cannot be changed/i)
    })
  })

  it('refuses to add an entry to a completed reconciliation', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const lineId = await postBankEntry(tx, fixture, '250')

      const reconciliation = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '0',
          status: 'COMPLETED',
        },
        select: { id: true },
      })

      await expect(
        tx.reconciliationEntry.create({
          data: { orgId: fixture.ctx.orgId, reconciliationId: reconciliation.id, journalLineId: lineId },
        }),
      ).rejects.toThrow(/complete\. Undo it before changing/i)
    })
  })

  it('leaves the journal line untouched — clearing is recorded beside it', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await makeOrg(tx)
      const lineId = await postBankEntry(tx, fixture, '250')

      const before = await tx.journalLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { debit: true, credit: true, journalDate: true },
      })

      const reconciliation = await tx.bankReconciliation.create({
        data: {
          orgId: fixture.ctx.orgId,
          accountId: fixture.accounts[CODE.bank],
          statementDate: new Date('2026-03-31T00:00:00Z'),
          statementEndingBalance: '250',
          beginningBalance: '0',
        },
        select: { id: true },
      })
      await tx.reconciliationEntry.create({
        data: { orgId: fixture.ctx.orgId, reconciliationId: reconciliation.id, journalLineId: lineId },
      })

      const after = await tx.journalLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { debit: true, credit: true, journalDate: true },
      })

      // R4 holds: the ledger is append-only even through reconciliation.
      expect(after.debit.toString()).toBe(before.debit.toString())
      expect(after.credit.toString()).toBe(before.credit.toString())
      expect(after.journalDate.toISOString()).toBe(before.journalDate.toISOString())
    })
  })
})

afterAll(async () => {
  await db.$disconnect()
})
