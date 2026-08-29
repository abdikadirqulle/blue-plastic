import { describe, expect, it } from 'vitest'

import { Decimal } from '@/lib/money'
import { buildDepositJournal, buildTransferJournal } from '@/server/accounting/builders/banking'

function totals(lines: { debit?: unknown; credit?: unknown }[]) {
  let debit = new Decimal(0)
  let credit = new Decimal(0)
  for (const line of lines) {
    if (line.debit) debit = debit.plus(String(line.debit))
    if (line.credit) credit = credit.plus(String(line.credit))
  }
  return { debit, credit }
}

describe('transfer', () => {
  const journal = buildTransferJournal({
    date: '2026-03-15',
    number: 'TRF-00001',
    transferId: 'trf-1',
    fromAccountId: 'acct-current',
    toAccountId: 'acct-savings',
    amount: '5000',
  })

  it('debits the destination and credits the source', () => {
    expect(journal.lines.find((l) => l.accountId === 'acct-savings')?.debit?.toString()).toBe('5000')
    expect(journal.lines.find((l) => l.accountId === 'acct-current')?.credit?.toString()).toBe('5000')
  })

  it('has exactly two lines — nothing was earned or spent', () => {
    // Recording a transfer as a sale on one side and a purchase on the other is
    // one of the commonest ways a set of books overstates both.
    expect(journal.lines).toHaveLength(2)
  })

  it('balances', () => {
    const { debit, credit } = totals(journal.lines)
    expect(debit.toString()).toBe(credit.toString())
  })
})

describe('deposit', () => {
  it('debits the bank and clears what it came from', () => {
    const journal = buildDepositJournal({
      date: '2026-03-15',
      number: 'DEP-00001',
      depositId: 'dep-1',
      bankAccountId: 'acct-bank',
      lines: [{ accountId: 'acct-undeposited', amount: '1200', description: 'Payments banked' }],
    })

    expect(journal.lines.find((l) => l.accountId === 'acct-bank')?.debit?.toString()).toBe('1200')
    expect(journal.lines.find((l) => l.accountId === 'acct-undeposited')?.credit?.toString()).toBe('1200')
    expect(journal.lines).toHaveLength(2)
  })

  it('merges several sources into one credit each, as the slip reads', () => {
    const journal = buildDepositJournal({
      date: '2026-03-15',
      number: 'DEP-00002',
      depositId: 'dep-2',
      bankAccountId: 'acct-bank',
      lines: [
        { accountId: 'acct-undeposited', amount: '500' },
        { accountId: 'acct-undeposited', amount: '300' },
        { accountId: 'acct-interest', amount: '12.50', description: 'Interest' },
      ],
    })

    expect(journal.lines.find((l) => l.accountId === 'acct-bank')?.debit?.toString()).toBe('812.5')
    expect(journal.lines.find((l) => l.accountId === 'acct-undeposited')?.credit?.toString()).toBe('800')
    expect(journal.lines.find((l) => l.accountId === 'acct-interest')?.credit?.toString()).toBe('12.5')
    expect(journal.lines).toHaveLength(3)
  })

  it('balances whatever the mix', () => {
    const journal = buildDepositJournal({
      date: '2026-03-15',
      number: 'DEP-00003',
      depositId: 'dep-3',
      bankAccountId: 'acct-bank',
      lines: [
        { accountId: 'acct-undeposited', amount: '99.99' },
        { accountId: 'acct-interest', amount: '0.01' },
      ],
    })
    const { debit, credit } = totals(journal.lines)
    expect(debit.toString()).toBe(credit.toString())
    expect(debit.toString()).toBe('100')
  })
})
