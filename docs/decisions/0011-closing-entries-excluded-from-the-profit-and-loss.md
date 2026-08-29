# ADR-0011 — Closing entries are excluded from the profit and loss

**Status:** Accepted · 2026-08-29 · Applies from Phase 9

## Decision
The profit and loss and the statement of cash flows exclude journals flagged
`isClosingEntry`. The balance sheet, trial balance and general ledger include
them. A reversal of a closing entry inherits the flag.

## Rationale
The year-end closing entry takes every income and expense account to zero at the
year end. It is dated inside the year it closes, so a profit and loss for that
year that counted it would report the year as having earned nothing — and every
comparative against a closed year would be useless. This is not hypothetical: it
is what the implementation did until the tests in `tests/year-end.test.ts` caught
it.

Excluding it is safe for the cash flow's reconciliation. That statement is built
on Σ(debit − credit) = 0 across every account; a closing entry balances and
touches no cash account, so removing it from every account at once changes
neither the identity nor the movement in cash.

The balance sheet must keep it. There, the sweep to Retained Earnings is a real
movement: after the close the nominal accounts are genuinely zero and the profit
genuinely sits in equity. Counting it in one statement and not the other is not
an inconsistency — the two statements are asking different questions.

The reversal has to carry the flag as well. Leaving out the sweep while counting
the sweep coming back would make a reopened year report double its income. So
`reverseJournal` inherits `isClosingEntry` (and `isAdjusting`) from the original,
and the database constraint `journals_closing_entry_source` permits a source type
of `CLOSING_ENTRY` or `REVERSAL`.

## Consequences
`accountFigures` takes an `excludeClosing` option; nothing else in the codebase
distinguishes journal kinds when reading balances, and nothing else should.

Reversing a closing entry by hand from the journal screen produces the same
result as reopening the year through the periods screen, because both go through
`reverseJournal`. The year's `status` and `closingJournalId` would then be stale,
which is why reopening is offered as its own action rather than left to be
assembled out of parts.
