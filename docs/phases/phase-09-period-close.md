# Phase 9 — Period close and year-end

**Status:** ✅ Complete — 2026-08-29
**Depends on:** Phases 2 and 8
**Blocks:** nothing — Phase 10 is hardening

## Goal

Draw a line under a month, and under a year. A closed month stops changing, a
closed year has its profit moved into equity, and both can be undone by a person
with the authority to do it — without anybody editing a posted journal.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 9.1 | Adjusting entries flagged and reportable separately | `close-checklist.ts`, `app/(app)/reports/adjusting-entries/` | ✅ |
| 9.2 | Month-end close checklist | `server/accounting/close-checklist.ts`, `components/periods/close-checklist.tsx` | ✅ |
| 9.3 | Year-end closing entry to Retained Earnings | `server/accounting/close.ts` | ✅ |
| 9.4 | Period lock/unlock with audit and permission gate | delivered in Phase 2; extended with the year lock and four database objects | ✅ |
| 9.5 | Prior-period comparatives after close | [ADR-0011](../decisions/0011-closing-entries-excluded-from-the-profit-and-loss.md) | ✅ |

## The closing entry

Revenue and expense accounts are nominal: they measure a year, not a state, and a
new year has to start them at zero. The closing entry debits every credit-balance
nominal account, credits every debit-balance one, and puts the difference to
Retained Earnings.

It is an ordinary journal — it balances, it is immutable, it appears in the
ledger, and it can be reversed. Nothing about the year-end is a special case in
the posting engine, which is why none of the ledger's guarantees have to be
suspended to run it.

Balances are taken **cumulative to the year end**, not as movement within the
year. If an earlier year was never closed, its profit is still sitting in the
nominal accounts and belongs in Retained Earnings too; taking the balance sweeps
it without a special case.

## Two rules that appear to conflict, and do not

A closed period refuses postings — R5, enforced by `trg_journal_period_open`
since Phase 2. The closing entry is dated at the year end, which falls inside the
last period of the year.

So the year-end **cannot** require the months to be closed first: the entry it
needs to post would be refused by the guard. The order is the other way round.
`closeYear` posts the entry while the periods are still open, then locks every
period and the year in the same transaction. After it commits, nothing can post
into that year at all — which is the guarantee that requiring pre-closed months
was reaching for.

`reopenYear` runs the same sequence backwards: unlock the periods, then reverse
the closing entry into the period that is now open again.

This was found by writing the rule the other way first and watching the tests
refuse it.

## Reopening

The ledger is immutable, so reopening reverses the closing entry rather than
deleting it. Both journals stay; the original is marked `REVERSED`; the reversal
carries the reason the user typed, into the ledger where anyone looking at the
year later will find it.

The reversal **inherits `isClosingEntry`**. Leaving the sweep out of the profit
and loss while counting the sweep coming back would make a reopened year report
double its income — see [ADR-0011](../decisions/0011-closing-entries-excluded-from-the-profit-and-loss.md).
It inherits `isAdjusting` for the same reason: reversing an adjustment is an
adjustment, and the adjusting-entries report should show both halves.

Years reopen in reverse order. Reopening 2025 while 2026 is closed would leave
2026's opening retained earnings no longer equal to 2025's closing figure.

## The checklist

Ten questions a bookkeeper would otherwise have to remember, run against the
period that is actually next in line to close. Severity is the design:

- **blocked** — the books disagree with themselves: debits ≠ credits, receivables
  without a customer, stock ledger against the Inventory account. Do not close.
- **warning** — something is unfinished: drafts dated in the period, unapplied
  payments, undeposited funds, an unreconciled bank account, imported lines not
  dealt with, a balance left in Opening Balance Equity. Closing is a choice, not
  an accident.
- **ok** — nothing to do.

Warnings do not refuse the close. A soft close is reversible, and software that
refuses to close the month teaches people to close it late, which is worse than
closing it over a warning they have read.

## Database objects added

| Object | Protects |
| --- | --- |
| `fiscal_years_closing_journal_org_fkey` | a year's closing journal cannot belong to another organisation (R9) |
| `journals_closing_entry_source` | a journal flagged as a closing entry is sourced as one, or reverses one |
| `fiscal_years_close_record` | an open year carries no record of having been closed |
| `trg_locked_year_periods` / `trg_locked_year_self` | a closed year contains no period still accepting postings |

56 integrity objects in total. `prisma/sql/period-integrity.sql`, applied by
`pnpm db:harden`, asserted by `pnpm db:verify`.

## Verification

| What | How |
| --- | --- |
| The entry zeroes every nominal account and credits Retained Earnings | `tests/year-end.test.ts` |
| A closed year still reports its own profit and loss | same |
| The balance sheet is identical before and after the close | same |
| The year and all thirteen periods lock | same |
| Posting into a closed year is refused by the database | same |
| A year cannot be closed twice, and an empty year posts no journal | same |
| Reopening reverses rather than deletes, and restores the figures exactly | same |
| A reopened year can be adjusted and closed again, with the new profit | same |
| The checklist passes clean books and flags undeposited funds and drafts | same |

## What Phase 9 does not do

- No closing of individual months into a summarised balance. A soft close is a
  status, not a rewrite of the ledger, and that is deliberate.
- No opening-balance rollforward document. The balance sheet is computed from the
  ledger at any date, so there is nothing to roll forward.
- No user-configurable closing account. It is Retained Earnings, found by
  `systemKey`, and a business that wants the profit somewhere else can journal it
  out afterwards.
