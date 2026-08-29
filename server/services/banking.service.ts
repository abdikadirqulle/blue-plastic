import 'server-only'
import type { Prisma } from '@prisma/client'

import { toCalendarDate, toDate, type CalendarDate } from '@/lib/date'
import { Decimal, ZERO } from '@/lib/money'
import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { DepositInput, TransferInput } from '@/lib/validation/banking'
import { buildDepositJournal, buildTransferJournal } from '@/server/accounting/builders/banking'
import { systemAccountId } from '@/server/accounting/chart-of-accounts'
import { postJournal, reverseJournal } from '@/server/accounting/posting'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { conflict, notFound, precondition, validation } from '@/server/errors'
import { nextDocumentNumber } from '@/server/sequences'

/** Accounts a bank register can be opened on. */
export async function bankAccounts(ctx: OrgContext) {
  const accounts = await db.ledgerAccount.findMany({
    where: {
      orgId: ctx.orgId,
      isActive: true,
      subtype: { in: ['BANK', 'CREDIT_CARD', 'UNDEPOSITED_FUNDS'] },
    },
    select: { id: true, code: true, name: true, subtype: true, type: true },
    orderBy: { code: 'asc' },
  })

  const balances = await db.$queryRaw<{ accountId: string; balance: string; cleared: string }[]>`
    SELECT l."accountId" AS "accountId",
           COALESCE(SUM(l.debit - l.credit), 0) AS balance,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit - l.credit ELSE 0 END), 0) AS cleared
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
      LEFT JOIN reconciliation_entries e ON e."journalLineId" = l.id
     WHERE l."orgId" = ${ctx.orgId}
       AND l."accountId" = ANY(${accounts.map((a) => a.id)})
     GROUP BY l."accountId"
  `

  const byId = new Map(balances.map((row) => [row.accountId, row]))

  return accounts.map((account) => {
    const row = byId.get(account.id)
    const balance = new Decimal(row?.balance ?? '0')
    const cleared = new Decimal(row?.cleared ?? '0')
    return {
      ...account,
      // A credit card is a liability: showing it as a negative asset helps nobody.
      balance: account.type === 'LIABILITY' ? balance.negated() : balance,
      cleared: account.type === 'LIABILITY' ? cleared.negated() : cleared,
      uncleared: balance.minus(cleared).abs(),
    }
  })
}

/* --- Transfers ------------------------------------------------------------ */

export async function listTransfers(ctx: OrgContext, query: ListQuery) {
  const where: Prisma.BankTransferWhereInput = {
    orgId: ctx.orgId,
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: 'insensitive' } },
            { memo: { contains: query.q, mode: 'insensitive' } },
            { reference: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.bankTransfer.findMany({
      where,
      select: {
        id: true, number: true, date: true, amount: true, memo: true, reference: true, status: true,
        fromAccount: { select: { id: true, code: true, name: true } },
        toAccount: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      ...paginate(query),
    }),
    db.bankTransfer.count({ where }),
  ])

  return paged(rows.map((row) => ({ ...row, amount: row.amount.toString() })), total, query)
}

export async function createTransfer(ctx: OrgContext, input: TransferInput) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      requireMoneyAccount(tx, ctx, input.fromAccountId),
      requireMoneyAccount(tx, ctx, input.toAccountId),
    ])

    const number = await nextDocumentNumber(tx, ctx.orgId, 'TRANSFER')
    const amount = new Decimal(input.amount)

    const transfer = await tx.bankTransfer.create({
      data: {
        orgId: ctx.orgId,
        number,
        date: toDate(input.date),
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: amount.toFixed(4),
        memo: input.memo ?? null,
        reference: input.reference ?? null,
        currencyCode: ctx.organization.baseCurrency,
        createdById: ctx.userId,
      },
      select: { id: true, number: true },
    })

    const journal = await postJournal(
      tx,
      ctx,
      buildTransferJournal({
        date: input.date,
        number: transfer.number,
        transferId: transfer.id,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount,
        memo: input.memo,
      }),
    )

    await tx.bankTransfer.update({ where: { id: transfer.id }, data: { journalId: journal.id } })

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'BankTransfer',
        entityId: transfer.id,
        action: 'CREATE',
        after: { number: transfer.number, amount: amount.toString(), from: from.name, to: to.name },
      },
      meta,
    )

    return { id: transfer.id, number: transfer.number }
  })
}

/* --- Deposits ------------------------------------------------------------- */

/** Customer payments sitting in Undeposited Funds, waiting to be banked. */
export async function undepositedPayments(ctx: OrgContext) {
  const undeposited = await systemAccountId(db as unknown as Tx, ctx.orgId, 'UNDEPOSITED_FUNDS')

  const payments = await db.customerPayment.findMany({
    where: {
      orgId: ctx.orgId,
      depositAccountId: undeposited,
      status: { not: 'VOID' },
      // A payment already on a paying-in slip is not waiting for one.
      depositLines: { none: {} },
    },
    select: {
      id: true, number: true, date: true, amount: true, method: true, reference: true,
      customer: { select: { displayName: true } },
    },
    orderBy: { date: 'asc' },
  })

  return payments.map((payment) => ({ ...payment, amount: payment.amount.toString() }))
}

export async function listDeposits(ctx: OrgContext, query: ListQuery) {
  const where: Prisma.DepositWhereInput = {
    orgId: ctx.orgId,
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: 'insensitive' } }, { memo: { contains: query.q, mode: 'insensitive' } }] } : {}),
  }

  const [rows, total] = await Promise.all([
    db.deposit.findMany({
      where,
      select: {
        id: true, number: true, date: true, total: true, memo: true, status: true,
        bankAccount: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      ...paginate(query),
    }),
    db.deposit.count({ where }),
  ])

  return paged(rows.map((row) => ({ ...row, total: row.total.toString() })), total, query)
}

export async function createDeposit(ctx: OrgContext, input: DepositInput) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const bank = await requireMoneyAccount(tx, ctx, input.bankAccountId, ['BANK'])
    const undeposited = await systemAccountId(tx, ctx.orgId, 'UNDEPOSITED_FUNDS')

    const payments = input.paymentIds.length
      ? await tx.customerPayment.findMany({
          where: { id: { in: input.paymentIds }, orgId: ctx.orgId },
          select: {
            id: true, number: true, amount: true, depositAccountId: true, status: true,
            depositLines: { select: { id: true } },
          },
        })
      : []

    if (payments.length !== input.paymentIds.length) throw notFound('Payment')

    for (const payment of payments) {
      if (payment.status === 'VOID') {
        throw precondition(`Payment ${payment.number} is void and cannot be banked.`)
      }
      if (payment.depositAccountId !== undeposited) {
        throw validation(
          `Payment ${payment.number} went straight to a bank account, so there is nothing to deposit.`,
        )
      }
      if (payment.depositLines.length > 0) {
        throw conflict(`Payment ${payment.number} is already on a paying-in slip.`)
      }
    }

    const paymentTotal = payments.reduce((sum, p) => sum.plus(p.amount.toString()), ZERO)
    const otherTotal = input.otherLines.reduce((sum, line) => sum.plus(line.amount), ZERO)
    const total = paymentTotal.plus(otherTotal)

    if (total.isZero()) {
      throw validation('A deposit with nothing on it has nothing to record.')
    }

    const number = await nextDocumentNumber(tx, ctx.orgId, 'DEPOSIT')
    let lineNumber = 0

    const deposit = await tx.deposit.create({
      data: {
        orgId: ctx.orgId,
        number,
        date: toDate(input.date),
        bankAccountId: bank.id,
        total: total.toFixed(4),
        memo: input.memo ?? null,
        reference: input.reference ?? null,
        currencyCode: ctx.organization.baseCurrency,
        createdById: ctx.userId,
        lines: {
          create: [
            ...payments.map((payment) => ({
              orgId: ctx.orgId,
              lineNumber: ++lineNumber,
              customerPaymentId: payment.id,
              description: `Payment ${payment.number}`,
              amount: payment.amount.toString(),
            })),
            ...input.otherLines.map((line) => ({
              orgId: ctx.orgId,
              lineNumber: ++lineNumber,
              accountId: line.accountId,
              description: line.description ?? null,
              amount: line.amount,
            })),
          ],
        },
      },
      select: { id: true, number: true },
    })

    const journal = await postJournal(
      tx,
      ctx,
      buildDepositJournal({
        date: input.date,
        number: deposit.number,
        depositId: deposit.id,
        bankAccountId: bank.id,
        memo: input.memo,
        lines: [
          // Everything banked out of Undeposited Funds clears that account.
          ...(paymentTotal.isZero()
            ? []
            : [{ accountId: undeposited, amount: paymentTotal, description: 'Payments banked' }]),
          ...input.otherLines.map((line) => ({
            accountId: line.accountId,
            amount: line.amount,
            description: line.description ?? null,
          })),
        ],
      }),
    )

    await tx.deposit.update({ where: { id: deposit.id }, data: { journalId: journal.id } })

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'Deposit',
        entityId: deposit.id,
        action: 'CREATE',
        after: { number: deposit.number, total: total.toString(), payments: payments.length },
      },
      meta,
    )

    return { id: deposit.id, number: deposit.number }
  })
}

/* --- Voiding -------------------------------------------------------------- */

export async function voidTransfer(ctx: OrgContext, id: string, reason: string) {
  return voidBankDocument(ctx, 'BankTransfer', id, reason)
}

export async function voidDeposit(ctx: OrgContext, id: string, reason: string) {
  return voidBankDocument(ctx, 'Deposit', id, reason)
}

async function voidBankDocument(
  ctx: OrgContext,
  entity: 'BankTransfer' | 'Deposit',
  id: string,
  reason: string,
) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const document =
      entity === 'BankTransfer'
        ? await tx.bankTransfer.findFirst({
            where: { id, orgId: ctx.orgId },
            select: { id: true, number: true, status: true, journalId: true },
          })
        : await tx.deposit.findFirst({
            where: { id, orgId: ctx.orgId },
            select: { id: true, number: true, status: true, journalId: true },
          })

    if (!document) throw notFound(entity === 'BankTransfer' ? 'Transfer' : 'Deposit')
    if (document.status === 'VOID') throw conflict(`${document.number} is already void.`)

    // Something already reconciled has been agreed with the bank. Unpicking it
    // silently would put a finished reconciliation out by exactly this amount.
    if (document.journalId) {
      const cleared = await tx.reconciliationEntry.count({
        where: { journalLine: { journalId: document.journalId } },
      })
      if (cleared > 0) {
        throw precondition(
          `${document.number} has been reconciled. Undo that reconciliation before voiding it.`,
        )
      }

      await reverseJournal(tx, ctx, document.journalId, {
        reason: `${document.number} voided — ${reason}`,
      })
    }

    if (entity === 'BankTransfer') {
      await tx.bankTransfer.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
      })
    } else {
      await tx.deposit.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
      })
      // Releasing the payments puts them back in the undeposited list.
      await tx.depositLine.deleteMany({ where: { depositId: id } })
    }

    await writeAudit(
      tx,
      ctx,
      { entity, entityId: id, action: 'REVERSE', after: { status: 'VOID', reason } },
      meta,
    )

    return { id, number: document.number }
  })
}

async function requireMoneyAccount(
  tx: Tx,
  ctx: OrgContext,
  accountId: string,
  allowed: string[] = ['BANK', 'CREDIT_CARD', 'UNDEPOSITED_FUNDS'],
) {
  const account = await tx.ledgerAccount.findFirst({
    where: { id: accountId, orgId: ctx.orgId, isActive: true },
    select: { id: true, name: true, code: true, subtype: true },
  })
  if (!account) throw notFound('Account')
  if (!allowed.includes(account.subtype)) {
    throw validation(
      `"${account.name}" is not a ${allowed.includes('CREDIT_CARD') ? 'bank, credit card or undeposited funds' : 'bank'} account.`,
    )
  }
  return account
}

export { toCalendarDate, type CalendarDate }
