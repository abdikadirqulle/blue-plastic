import { afterAll, describe, expect, it } from 'vitest'

import { postJournal } from '@/server/accounting/posting'
import { db, type Tx } from '@/server/db'
import { CODE, inRolledBackTransaction, makeOrg } from './ledger-helpers'

/**
 * These bypass the posting engine entirely and attack the tables with raw SQL.
 *
 * That is the point. The engine's checks produce good error messages; the
 * database's are the actual guarantee. A rule that only the application enforces
 * is a rule that a migration script, a psql session or next year's service will
 * quietly break.
 */
const suite = process.env.DATABASE_URL ? describe : describe.skip

suite('R1 — a line is a debit or a credit', () => {
  it('refuses a line that is both', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await expect(
        rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '10', credit: '10' }),
      ).rejects.toThrow(/journal_lines_one_sided/)
    })
  })

  it('refuses a negative amount', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await expect(
        rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '-10', credit: '0' }),
      ).rejects.toThrow(/journal_lines_one_sided/)
    })
  })

  it('refuses a line with no value at all', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await expect(
        rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '0', credit: '0' }),
      ).rejects.toThrow(/journal_lines_one_sided/)
    })
  })
})

suite('R2/R3 — a posted journal balances and has two lines', () => {
  /**
   * The balance trigger is DEFERRED: it fires at COMMIT, so lines can be inserted
   * one at a time. These tests never commit, so they force the check early with
   * `SET CONSTRAINTS ALL IMMEDIATE` — the same assertion the database would make
   * at COMMIT, just brought forward.
   */
  it('refuses an unbalanced journal at commit time', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '100', credit: '0' })
      await rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.bank], debit: '0', credit: '90' })

      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
        /out of balance: debits 100.0000, credits 90.0000, difference 10.0000/,
      )
    })
  })

  it('refuses a single-line journal at commit time', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '100', credit: '0' })

      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
        /has 1 line\(s\). Double-entry requires at least two/,
      )
    })
  })

  it('accepts a balanced journal built one line at a time', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const journalId = await rawJournal(tx, ctx.orgId, '2026-03-15')

      await rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.rent], debit: '100', credit: '0' })
      await rawLine(tx, { journalId, orgId: ctx.orgId, accountId: accounts[CODE.bank], debit: '0', credit: '100' })

      // Deferring is what makes this legal; an immediate trigger would have
      // rejected the first line.
      await expect(tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')).resolves.toBeDefined()
    })
  })
})

suite('R4 — a posted journal is immutable', () => {
  it('refuses to change the amount on a posted line', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const posted = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '100' },
          { accountId: accounts[CODE.bank], credit: '100' },
        ],
      })

      await expect(
        tx.$executeRaw`UPDATE journal_lines SET debit = 999 WHERE "journalId" = ${posted.id} AND debit > 0`,
      ).rejects.toThrow(/cannot be changed once the journal is posted/i)
    })
  })

  it('refuses to delete a posted line', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const posted = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '100' },
          { accountId: accounts[CODE.bank], credit: '100' },
        ],
      })

      await expect(
        tx.$executeRaw`DELETE FROM journal_lines WHERE "journalId" = ${posted.id}`,
      ).rejects.toThrow(/cannot be changed once the journal is posted/i)
    })
  })

  it('refuses to delete a posted journal', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const posted = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '100' },
          { accountId: accounts[CODE.bank], credit: '100' },
        ],
      })

      await expect(tx.$executeRaw`DELETE FROM journals WHERE id = ${posted.id}`).rejects.toThrow(
        /posted and cannot be deleted/i,
      )
    })
  })

  it('refuses to backdate a posted journal', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const posted = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '100' },
          { accountId: accounts[CODE.bank], credit: '100' },
        ],
      })

      await expect(
        tx.$executeRaw`UPDATE journals SET date = '2026-01-01' WHERE id = ${posted.id}`,
      ).rejects.toThrow(/posted and immutable/i)
    })
  })

  it('allows only the POSTED to REVERSED transition, and nothing alongside it', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const posted = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '100' },
          { accountId: accounts[CODE.bank], credit: '100' },
        ],
      })

      // Status alone: permitted.
      await expect(
        tx.$executeRaw`UPDATE journals SET status = 'REVERSED' WHERE id = ${posted.id}`,
      ).resolves.toBe(1)

      // Anything else riding along with it: not permitted.
      const second = await postJournal(tx, ctx, {
        date: '2026-03-16',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '5' },
          { accountId: accounts[CODE.bank], credit: '5' },
        ],
      })

      await expect(
        tx.$executeRaw`UPDATE journals SET status = 'REVERSED', memo = 'smuggled' WHERE id = ${second.id}`,
      ).rejects.toThrow(/posted and immutable/i)
    })
  })
})

suite('R5/R6 — period guard', () => {
  it('refuses a journal dated outside its own period', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const march = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '1' },
          { accountId: accounts[CODE.bank], credit: '1' },
        ],
      })

      // Claim March's period for a July date.
      await expect(
        tx.$executeRaw`
          INSERT INTO journals (id, "orgId", "journalNumber", date, "periodId", "sourceType", status, "currencyCode", "updatedAt")
          VALUES ('mismatched-period', ${ctx.orgId}, 'JE-99999', '2026-07-04', ${march.periodId}, 'MANUAL', 'POSTED', 'USD', now())
        `,
      ).rejects.toThrow(/falls outside its accounting period/i)
    })
  })

  it('refuses a posting into a closed period from raw SQL', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx, accounts } = await makeOrg(tx)
      const march = await postJournal(tx, ctx, {
        date: '2026-03-15',
        sourceType: 'MANUAL',
        lines: [
          { accountId: accounts[CODE.rent], debit: '1' },
          { accountId: accounts[CODE.bank], credit: '1' },
        ],
      })

      await tx.accountingPeriod.update({ where: { id: march.periodId }, data: { status: 'CLOSED' } })

      await expect(
        tx.$executeRaw`
          INSERT INTO journals (id, "orgId", "journalNumber", date, "periodId", "sourceType", status, "currencyCode", "updatedAt")
          VALUES ('into-closed', ${ctx.orgId}, 'JE-99998', '2026-03-20', ${march.periodId}, 'MANUAL', 'POSTED', 'USD', now())
        `,
      ).rejects.toThrow(/is closed and cannot accept postings/i)
    })
  })
})

suite('R9 — a line cannot cross organisations', () => {
  it('refuses a line whose account belongs to another organisation', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await makeOrg(tx)
      const b = await makeOrg(tx)

      const journalId = await rawJournal(tx, a.ctx.orgId, '2026-03-15')

      // Organisation A's journal, organisation B's account, A's orgId on the line.
      await expect(
        rawLine(tx, {
          journalId,
          orgId: a.ctx.orgId,
          accountId: b.accounts[CODE.rent],
          debit: '10',
          credit: '0',
        }),
      ).rejects.toThrow(/journal_lines_account_org_fkey|foreign key/i)
    })
  })
})

suite('R10 — system accounts are protected', () => {
  it('refuses to delete a system account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { accounts } = await makeOrg(tx)

      await expect(
        tx.$executeRaw`DELETE FROM ledger_accounts WHERE id = ${accounts[CODE.receivable]}`,
      ).rejects.toThrow(/system account and cannot be deleted/i)
    })
  })

  it('refuses to repurpose a system account', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { accounts } = await makeOrg(tx)

      await expect(
        tx.$executeRaw`UPDATE ledger_accounts SET "systemKey" = 'COGS' WHERE id = ${accounts[CODE.receivable]}`,
      ).rejects.toThrow(/system role .* cannot be changed/i)
    })
  })

  it('allows a system account to be renamed', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { accounts } = await makeOrg(tx)

      await expect(
        tx.$executeRaw`UPDATE ledger_accounts SET name = 'Trade Debtors' WHERE id = ${accounts[CODE.receivable]}`,
      ).resolves.toBe(1)
    })
  })

  it('refuses an account whose subtype belongs to a different statement type', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ctx } = await makeOrg(tx)

      await expect(
        tx.ledgerAccount.create({
          data: { orgId: ctx.orgId, code: '9999', name: 'Nonsense', type: 'REVENUE', subtype: 'BANK' },
        }),
      ).rejects.toThrow(/does not belong to type/i)
    })
  })
})

/* --- raw helpers: deliberately bypassing the posting engine ---------------- */

async function rawJournal(tx: Tx, orgId: string, date: string) {
  const id = `raw-${Math.random().toString(36).slice(2, 12)}`
  const period = await tx.accountingPeriod.findFirst({
    where: { orgId, startDate: { lte: new Date(`${date}T00:00:00Z`) }, endDate: { gte: new Date(`${date}T00:00:00Z`) } },
    select: { id: true },
  })

  const periodId = period?.id ?? (await createPeriods(tx, orgId, date))

  await tx.$executeRaw`
    INSERT INTO journals (id, "orgId", "journalNumber", date, "periodId", "sourceType", status, "currencyCode", "updatedAt")
    VALUES (${id}, ${orgId}, ${`RAW-${id.slice(-6)}`}, ${new Date(`${date}T00:00:00Z`)}, ${periodId}, 'MANUAL', 'POSTED', 'USD', now())
  `
  return id
}

async function createPeriods(tx: Tx, orgId: string, date: string) {
  const { ensureFiscalYear } = await import('@/server/accounting/period')
  await ensureFiscalYear(tx, orgId, 1, Number(date.slice(0, 4)))
  const period = await tx.accountingPeriod.findFirst({
    where: { orgId, startDate: { lte: new Date(`${date}T00:00:00Z`) }, endDate: { gte: new Date(`${date}T00:00:00Z`) } },
    select: { id: true },
  })
  return period!.id
}

let lineNumber = 0

async function rawLine(
  tx: Tx,
  line: { journalId: string; orgId: string; accountId: string; debit: string; credit: string },
) {
  lineNumber += 1
  return tx.$executeRaw`
    INSERT INTO journal_lines (id, "journalId", "orgId", "lineNumber", "accountId", debit, credit, "journalDate")
    VALUES (${`rawline-${lineNumber}-${Math.random().toString(36).slice(2, 8)}`},
            ${line.journalId}, ${line.orgId}, ${lineNumber},
            ${line.accountId}, ${line.debit}::numeric, ${line.credit}::numeric, CURRENT_DATE)
  `
}

afterAll(async () => {
  await db.$disconnect()
})
