import 'server-only'

import { Decimal } from '@/lib/money'
import type { CalendarDate } from '@/lib/date'
import type { DraftJournal, DraftLine } from '@/server/accounting/posting'

/**
 * Banking journals. Pure functions, like the sales and purchase builders.
 */

/**
 * Transfer: money moves, nothing is earned or spent.
 *
 *   Dr destination account   amount
 *     Cr source account        amount
 *
 * Note what is absent: no income, no expense. Recording a transfer as a sale on
 * one side and a purchase on the other is one of the commonest ways a set of
 * books ends up overstating both, and a test asserts this journal has exactly two
 * lines, neither of them a profit-and-loss account.
 */
export function buildTransferJournal(input: {
  date: CalendarDate
  number: string
  transferId: string
  fromAccountId: string
  toAccountId: string
  amount: Decimal.Value
  memo?: string | null
}): DraftJournal {
  return {
    date: input.date,
    memo: input.memo ?? `Transfer ${input.number}`,
    sourceType: 'TRANSFER',
    sourceId: input.transferId,
    lines: [
      { accountId: input.toAccountId, debit: input.amount, description: `Transfer ${input.number}` },
      { accountId: input.fromAccountId, credit: input.amount, description: `Transfer ${input.number}` },
    ],
  }
}

export type DepositJournalLine = {
  /** Undeposited Funds when banking a customer payment, otherwise the source account. */
  accountId: string
  amount: Decimal.Value
  description?: string | null
}

/**
 * Deposit: what was held is now at the bank.
 *
 *   Dr Bank                       total
 *     Cr Undeposited Funds          the payments being banked
 *     Cr other accounts             anything else on the paying-in slip
 *
 * Clearing Undeposited Funds is the whole point. Without it the register shows
 * five payments where the bank shows one paying-in slip, and reconciliation
 * becomes an exercise in matching things that were never going to match.
 */
export function buildDepositJournal(input: {
  date: CalendarDate
  number: string
  depositId: string
  bankAccountId: string
  lines: DepositJournalLine[]
  memo?: string | null
}): DraftJournal {
  const total = input.lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0))

  // One credit per source account, so the journal reads as the slip does.
  const byAccount = new Map<string, { amount: Decimal; description: string | null }>()
  for (const line of input.lines) {
    const existing = byAccount.get(line.accountId)
    if (existing) existing.amount = existing.amount.plus(line.amount)
    else byAccount.set(line.accountId, { amount: new Decimal(line.amount), description: line.description ?? null })
  }

  const credits: DraftLine[] = [...byAccount.entries()].map(([accountId, entry]) => ({
    accountId,
    credit: entry.amount,
    description: entry.description,
  }))

  return {
    date: input.date,
    memo: input.memo ?? `Deposit ${input.number}`,
    sourceType: 'DEPOSIT',
    sourceId: input.depositId,
    lines: [
      { accountId: input.bankAccountId, debit: total, description: `Deposit ${input.number}` },
      ...credits,
    ],
  }
}
