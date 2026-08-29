import 'server-only'

import { toCalendarDate, toDate, type CalendarDate } from '@/lib/date'
import { Decimal, ZERO } from '@/lib/money'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { conflict, notFound, precondition, validation } from '@/server/errors'

/**
 * Reconciling an account against its statement.
 *
 * The arithmetic is the whole of it:
 *
 *   beginning balance + what you have ticked  =  the statement's closing balance
 *
 * When that holds, the books and the bank agree about every item up to that date.
 * When it does not, something is missing from one side or the other, and the
 * difference is the size of what is missing. A reconciliation that can be
 * finished while the difference is non-zero is not a reconciliation.
 *
 * Cleared lines are recorded in `reconciliation_entries` rather than as a flag on
 * the journal line, because a posted line is immutable (R4).
 */

export type ReconcilableLine = {
  lineId: string
  journalId: string
  journalNumber: string
  date: Date
  description: string | null
  memo: string | null
  sourceType: string
  /** Signed as the account sees it: positive in, negative out. */
  amount: Decimal
  cleared: boolean
}

export async function start(
  ctx: OrgContext,
  input: { accountId: string; statementDate: CalendarDate; statementEndingBalance: string },
) {
  const meta = await requestMeta()

  const account = await db.ledgerAccount.findFirst({
    where: { id: input.accountId, orgId: ctx.orgId, isActive: true },
    select: { id: true, name: true, subtype: true },
  })
  if (!account) throw notFound('Account')
  if (!['BANK', 'CREDIT_CARD', 'UNDEPOSITED_FUNDS'].includes(account.subtype)) {
    throw validation(`"${account.name}" is not an account that receives a statement.`)
  }

  const existing = await db.bankReconciliation.findFirst({
    where: { orgId: ctx.orgId, accountId: input.accountId, status: 'IN_PROGRESS' },
    select: { id: true, statementDate: true },
  })
  if (existing) {
    throw conflict(
      `A reconciliation of ${account.name} to ${toCalendarDate(existing.statementDate)} is already ` +
        `in progress. Finish or discard it first.`,
    )
  }

  // Everything already agreed with the bank is where this one starts from.
  const beginning = await clearedBalance(db, ctx, input.accountId)

  return db.$transaction(async (tx) => {
    const reconciliation = await tx.bankReconciliation.create({
      data: {
        orgId: ctx.orgId,
        accountId: input.accountId,
        statementDate: toDate(input.statementDate),
        statementEndingBalance: new Decimal(input.statementEndingBalance).toFixed(4),
        beginningBalance: beginning.toFixed(4),
        startedById: ctx.userId,
      },
      select: { id: true },
    })

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'BankReconciliation',
        entityId: reconciliation.id,
        action: 'CREATE',
        after: {
          account: account.name,
          statementDate: input.statementDate,
          ending: input.statementEndingBalance,
          beginning: beginning.toString(),
        },
      },
      meta,
    )

    return { id: reconciliation.id }
  })
}

export async function get(ctx: OrgContext, id: string) {
  const reconciliation = await db.bankReconciliation.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true, statementDate: true, statementEndingBalance: true, beginningBalance: true,
      status: true, notes: true, startedAt: true, completedAt: true,
      account: { select: { id: true, code: true, name: true, subtype: true, type: true } },
      entries: { select: { journalLineId: true } },
    },
  })
  if (!reconciliation) throw notFound('Reconciliation')

  const cleared = new Set(reconciliation.entries.map((entry) => entry.journalLineId))
  const lines = await reconcilableLines(
    ctx,
    reconciliation.account.id,
    toCalendarDate(reconciliation.statementDate),
    cleared,
    reconciliation.status === 'COMPLETED',
  )

  const beginning = new Decimal(reconciliation.beginningBalance.toString())
  const ending = new Decimal(reconciliation.statementEndingBalance.toString())
  const clearedTotal = lines
    .filter((line) => line.cleared)
    .reduce((sum, line) => sum.plus(line.amount), ZERO)

  // The one number that matters.
  const difference = beginning.plus(clearedTotal).minus(ending)

  return {
    ...reconciliation,
    statementEndingBalance: ending,
    beginningBalance: beginning,
    lines,
    clearedTotal,
    difference,
    balanced: difference.isZero(),
  }
}

/**
 * Everything on the account up to the statement date that has not already been
 * agreed with the bank on an earlier statement.
 */
async function reconcilableLines(
  ctx: OrgContext,
  accountId: string,
  upTo: CalendarDate,
  clearedHere: Set<string>,
  completedOnly: boolean,
): Promise<ReconcilableLine[]> {
  const rows = await db.$queryRaw<
    {
      lineId: string
      journalId: string
      journalNumber: string
      date: Date
      description: string | null
      memo: string | null
      sourceType: string
      debit: string
      credit: string
      clearedElsewhere: boolean
    }[]
  >`
    SELECT l.id                AS "lineId",
           j.id                AS "journalId",
           j."journalNumber"   AS "journalNumber",
           j.date              AS "date",
           l.description       AS "description",
           j.memo              AS "memo",
           j."sourceType"::text AS "sourceType",
           l.debit             AS "debit",
           l.credit            AS "credit",
           (e.id IS NOT NULL)  AS "clearedElsewhere"
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
      LEFT JOIN reconciliation_entries e ON e."journalLineId" = l.id
     WHERE l."orgId" = ${ctx.orgId}
       AND l."accountId" = ${accountId}
       AND l."journalDate" <= ${toDate(upTo)}
     ORDER BY j.date ASC, j."journalNumber" ASC
  `

  return rows
    .filter((row) => {
      const cleared = clearedHere.has(row.lineId)
      // A completed reconciliation shows only what it itself cleared. One in
      // progress shows everything still available, plus what it has ticked.
      if (completedOnly) return cleared
      return cleared || !row.clearedElsewhere
    })
    .map((row) => ({
      lineId: row.lineId,
      journalId: row.journalId,
      journalNumber: row.journalNumber,
      date: row.date,
      description: row.description,
      memo: row.memo,
      sourceType: row.sourceType,
      amount: new Decimal(row.debit).minus(row.credit),
      cleared: clearedHere.has(row.lineId),
    }))
}

/** The account's balance according to everything reconciled so far. */
async function clearedBalance(
  client: Tx | typeof db,
  ctx: OrgContext,
  accountId: string,
): Promise<Decimal> {
  const [row] = await client.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM reconciliation_entries e
      JOIN journal_lines l ON l.id = e."journalLineId"
     WHERE e."orgId" = ${ctx.orgId}
       AND l."accountId" = ${accountId}
  `
  return new Decimal(row?.balance ?? '0')
}

export async function toggleCleared(
  ctx: OrgContext,
  input: { reconciliationId: string; journalLineId: string; cleared: boolean },
) {
  const reconciliation = await db.bankReconciliation.findFirst({
    where: { id: input.reconciliationId, orgId: ctx.orgId },
    select: { id: true, status: true, accountId: true },
  })
  if (!reconciliation) throw notFound('Reconciliation')
  if (reconciliation.status === 'COMPLETED') {
    throw precondition('That reconciliation is complete. Undo it before changing what is cleared.')
  }

  if (input.cleared) {
    await db.reconciliationEntry.upsert({
      where: { journalLineId: input.journalLineId },
      create: {
        orgId: ctx.orgId,
        reconciliationId: input.reconciliationId,
        journalLineId: input.journalLineId,
      },
      update: {},
    })
  } else {
    await db.reconciliationEntry.deleteMany({
      where: { journalLineId: input.journalLineId, reconciliationId: input.reconciliationId },
    })
  }

  return { ok: true as const }
}

/** Tick everything shown. The usual first move when a statement matches cleanly. */
export async function clearAll(ctx: OrgContext, reconciliationId: string) {
  const view = await get(ctx, reconciliationId)
  if (view.status === 'COMPLETED') {
    throw precondition('That reconciliation is complete.')
  }

  await db.reconciliationEntry.createMany({
    data: view.lines
      .filter((line) => !line.cleared)
      .map((line) => ({ orgId: ctx.orgId, reconciliationId, journalLineId: line.lineId })),
    skipDuplicates: true,
  })

  return { ok: true as const }
}

/**
 * Finish. Refused unless the difference is exactly zero — that is what makes it a
 * reconciliation rather than a note of intent.
 */
export async function finish(ctx: OrgContext, id: string, notes?: string | null) {
  const meta = await requestMeta()
  const view = await get(ctx, id)

  if (view.status === 'COMPLETED') throw conflict('That reconciliation is already complete.')

  if (!view.balanced) {
    throw precondition(
      `This does not balance yet. Beginning ${view.beginningBalance.toFixed(2)} plus ` +
        `${view.clearedTotal.toFixed(2)} cleared is ` +
        `${view.beginningBalance.plus(view.clearedTotal).toFixed(2)}, but the statement says ` +
        `${view.statementEndingBalance.toFixed(2)} — a difference of ` +
        `${view.difference.abs().toFixed(2)}. Something is missing from one side or the other.`,
    )
  }

  return db.$transaction(async (tx) => {
    const completed = await tx.bankReconciliation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: ctx.userId,
        notes: notes ?? null,
      },
      select: { id: true, statementDate: true },
    })

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'BankReconciliation',
        entityId: id,
        action: 'CLOSE_PERIOD',
        after: {
          statementDate: toCalendarDate(completed.statementDate),
          cleared: view.clearedTotal.toString(),
          ending: view.statementEndingBalance.toString(),
          items: view.lines.filter((line) => line.cleared).length,
        },
      },
      meta,
    )

    return { id, statementDate: toCalendarDate(completed.statementDate) }
  })
}

/**
 * Undo a completed reconciliation.
 *
 * Deliberately destructive and deliberately logged: the reconciliation is deleted
 * and every line it cleared becomes available again. It is not an edit, because
 * a reconciliation that can be edited is not evidence of anything.
 *
 * Only the most recent one may be undone — undoing an earlier one would leave the
 * later ones resting on a beginning balance that no longer means anything.
 */
export async function undo(ctx: OrgContext, id: string, reason: string) {
  const meta = await requestMeta()

  const reconciliation = await db.bankReconciliation.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true, accountId: true, statementDate: true, status: true,
      account: { select: { name: true } },
      _count: { select: { entries: true } },
    },
  })
  if (!reconciliation) throw notFound('Reconciliation')
  if (reconciliation.status !== 'COMPLETED') {
    throw precondition('That reconciliation is not complete, so there is nothing to undo.')
  }

  const later = await db.bankReconciliation.findFirst({
    where: {
      orgId: ctx.orgId,
      accountId: reconciliation.accountId,
      status: 'COMPLETED',
      statementDate: { gt: reconciliation.statementDate },
    },
    orderBy: { statementDate: 'asc' },
    select: { statementDate: true },
  })
  if (later) {
    throw precondition(
      `Undo the reconciliation to ${toCalendarDate(later.statementDate)} first. ` +
        `Reconciliations undo in reverse order, because each one begins where the last one ended.`,
    )
  }

  return db.$transaction(async (tx) => {
    await writeAudit(
      tx,
      ctx,
      {
        entity: 'BankReconciliation',
        entityId: id,
        action: 'REOPEN_PERIOD',
        before: {
          account: reconciliation.account.name,
          statementDate: toCalendarDate(reconciliation.statementDate),
          items: reconciliation._count.entries,
        },
        after: { reason },
      },
      meta,
    )

    // Entries cascade. The journal lines themselves are untouched — they always
    // were, which is the point of keeping clearing out of the ledger.
    await tx.bankReconciliation.delete({ where: { id } })

    return { id, statementDate: toCalendarDate(reconciliation.statementDate) }
  })
}

export async function history(ctx: OrgContext, accountId?: string) {
  return db.bankReconciliation
    .findMany({
      where: { orgId: ctx.orgId, ...(accountId ? { accountId } : {}) },
      select: {
        id: true, statementDate: true, statementEndingBalance: true, beginningBalance: true,
        status: true, completedAt: true, notes: true,
        account: { select: { id: true, code: true, name: true } },
        _count: { select: { entries: true } },
      },
      orderBy: [{ statementDate: 'desc' }],
      take: 100,
    })
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        statementEndingBalance: row.statementEndingBalance.toString(),
        beginningBalance: row.beginningBalance.toString(),
      })),
    )
}
