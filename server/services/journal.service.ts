import 'server-only'
import type { Prisma } from '@prisma/client'

import { Decimal, toMoneyString } from '@/lib/money'
import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { ManualJournalInput } from '@/lib/validation/accounting'
import { postJournal, reverseJournal } from '@/server/accounting/posting'
import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import { forbidden, notFound, validation } from '@/server/errors'

export type JournalRow = {
  id: string
  journalNumber: string
  date: Date
  memo: string | null
  sourceType: string
  status: string
  isAdjusting: boolean
  total: string
  lineCount: number
}

export async function list(ctx: OrgContext, query: ListQuery) {
  const where: Prisma.JournalWhereInput = {
    orgId: ctx.orgId,
    ...(query.q
      ? {
          OR: [
            { journalNumber: { contains: query.q, mode: 'insensitive' } },
            { memo: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [journals, total] = await Promise.all([
    db.journal.findMany({
      where,
      select: {
        id: true,
        journalNumber: true,
        date: true,
        memo: true,
        sourceType: true,
        status: true,
        isAdjusting: true,
        lines: { select: { debit: true } },
      },
      orderBy: [{ date: 'desc' }, { journalNumber: 'desc' }],
      ...paginate(query),
    }),
    db.journal.count({ where }),
  ])

  const rows: JournalRow[] = journals.map((journal) => ({
    id: journal.id,
    journalNumber: journal.journalNumber,
    date: journal.date,
    memo: journal.memo,
    sourceType: journal.sourceType,
    status: journal.status,
    isAdjusting: journal.isAdjusting,
    // A journal's "amount" is one side of it — debits and credits are equal by
    // construction, so summing both would double it.
    total: toMoneyString(
      journal.lines.reduce((sum, line) => sum.plus(new Decimal(line.debit.toString())), new Decimal(0)),
      2,
    ),
    lineCount: journal.lines.length,
  }))

  return paged(rows, total, query)
}

export async function get(ctx: OrgContext, id: string) {
  const journal = await db.journal.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true,
      journalNumber: true,
      date: true,
      memo: true,
      sourceType: true,
      sourceId: true,
      status: true,
      isAdjusting: true,
      isClosingEntry: true,
      currencyCode: true,
      postedAt: true,
      reversalReason: true,
      reversalOf: { select: { id: true, journalNumber: true, date: true } },
      reversedBy: { select: { id: true, journalNumber: true, date: true } },
      period: {
        select: { id: true, periodNumber: true, startDate: true, endDate: true, status: true },
      },
      lines: {
        orderBy: { lineNumber: 'asc' },
        select: {
          id: true,
          lineNumber: true,
          debit: true,
          credit: true,
          description: true,
          account: { select: { id: true, code: true, name: true, type: true } },
        },
      },
    },
  })

  if (!journal) throw notFound('Journal')

  const totalDebit = journal.lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.debit.toString())),
    new Decimal(0),
  )
  const totalCredit = journal.lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.credit.toString())),
    new Decimal(0),
  )

  return {
    ...journal,
    lines: journal.lines.map((line) => ({
      ...line,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
    })),
    totalDebit: toMoneyString(totalDebit, 2),
    totalCredit: toMoneyString(totalCredit, 2),
    balanced: totalDebit.equals(totalCredit),
  }
}

/**
 * Post a manual journal.
 *
 * Manual entry is the one place a human chooses both sides, so it is also the one
 * place where a control account could be hit without its subledger counterpart.
 * The posting engine refuses that (R7/R8); this refuses it earlier, with a
 * message that explains why rather than quoting a constraint.
 */
export async function createManual(ctx: OrgContext, input: ManualJournalInput) {
  const lines = input.lines
    .map((line) => ({
      accountId: line.accountId,
      debit: line.debit.trim(),
      credit: line.credit.trim(),
      description: line.description.trim() || null,
    }))
    .filter((line) => line.accountId && (line.debit !== '' || line.credit !== ''))

  if (lines.length < 2) {
    throw validation('Enter at least two lines: something debited and something credited.')
  }

  const controlAccounts = await db.ledgerAccount.findMany({
    where: {
      orgId: ctx.orgId,
      id: { in: lines.map((line) => line.accountId) },
      systemKey: { in: ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'INVENTORY_ASSET'] },
    },
    select: { name: true, systemKey: true },
  })

  if (controlAccounts.length > 0) {
    const names = [...new Set(controlAccounts.map((account) => account.name))].join(', ')
    throw forbidden(
      `${names} is a control account maintained by the system. ` +
        `Post to it through an invoice, bill, payment or inventory adjustment so the subledger stays in step.`,
    )
  }

  return db.$transaction((tx) =>
    postJournal(tx, ctx, {
      date: input.date,
      memo: input.memo,
      sourceType: 'MANUAL',
      isAdjusting: input.isAdjusting,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit === '' ? 0 : line.debit,
        credit: line.credit === '' ? 0 : line.credit,
        description: line.description,
      })),
    }),
  )
}

export async function reverse(
  ctx: OrgContext,
  input: { journalId: string; reason: string; date?: string },
) {
  return db.$transaction((tx) =>
    reverseJournal(tx, ctx, input.journalId, { reason: input.reason, date: input.date }),
  )
}
