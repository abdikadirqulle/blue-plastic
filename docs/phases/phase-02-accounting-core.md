# Phase 2 — Accounting Core

**Status:** ✅ Complete — 2026-08-28
**Depends on:** Phase 1
**Blocks:** every phase that records a business transaction

## Goal

The double-entry engine, and nothing that isn't. No customers, no invoices, no
bills — those are documents that *produce* journals, and they cannot be built
before the thing that accepts a journal is correct.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 2.1 | `LedgerAccount`: types, subtypes, hierarchy, `systemKey` | `prisma/schema.prisma` | ✅ |
| 2.2 | `FiscalYear` / `AccountingPeriod` + lazy generation | `server/accounting/period.ts` | ✅ |
| 2.3 | `Journal` / `JournalLine` | `prisma/schema.prisma` | ✅ |
| 2.4 | Integrity rules R1–R10 as triggers + `pnpm db:verify` | `prisma/sql/ledger-integrity.sql`, `scripts/verify-db.ts` | ✅ |
| 2.5 | Posting engine: `postJournal`, `reverseJournal` | `server/accounting/posting.ts` | ✅ |
| 2.6 | Default chart of accounts + system accounts | `server/accounting/chart-of-accounts.ts` | ✅ |
| 2.7 | Chart of accounts UI: grouped tree, balances, create/edit/archive | `app/(app)/accounts/` | ✅ |
| 2.8 | Manual journal entry with live balancing | `app/(app)/journals/new/` | ✅ |
| 2.9 | Opening balances through Opening Balance Equity | `server/services/account.service.ts` | ✅ |
| 2.10 | Trial balance, general ledger, account register | `server/accounting/balances.ts`, `app/(app)/reports/`, `app/(app)/accounts/[id]/` | ✅ |
| 2.11 | Period open/close, in order | `server/services/period.service.ts`, `app/(app)/periods/` | ✅ |
| 2.12 | Test suite for every rule | `tests/` | ✅ |

## Data model delivered

`LedgerAccount`, `FiscalYear`, `AccountingPeriod`, `Journal`, `JournalLine`, plus
the enums `AccountType`, `AccountSubtype`, `SystemAccountKey`, `PeriodStatus`,
`JournalStatus`, `JournalSourceType`.

Migrations: `20260828152200_ledger_core`, `20260828190242_ledger_tenant_fks`.

## The integrity rules, and where they live

Every rule is enforced twice: in the posting engine, which can explain itself, and
in the database, which is the actual guarantee. `pnpm db:verify` re-asserts all ten
objects exist in the connected database — a dropped trigger is otherwise completely
silent until the day it matters.

| Rule | Enforced by | What it prevents |
| --- | --- | --- |
| R1 | `journal_lines_one_sided` CHECK | a line that is both a debit and a credit, negative, or empty |
| R2/R3 | `trg_journal_balanced` — **deferred** constraint trigger | an unbalanced journal, or one with fewer than two lines, existing at COMMIT |
| R4 | `trg_journal_immutable`, `trg_journal_line_immutable` | editing or deleting anything posted |
| R5/R6 | `trg_journal_period_open` | posting into a closed period, or dating an entry outside its own period |
| R7 | `trg_journal_line_dimensions` | an AR line with no customer, an AP line with no vendor, a posting to an archived account or a grouping heading |
| R8 | `journal.service.ts` | a manual journal touching AR, AP or Inventory behind their documents' backs |
| R9 | composite FKs `(journalId, orgId)`, `(accountId, orgId)` | a line referencing another organisation's journal or account |
| R10 | `trg_protect_system_accounts` | deleting or repurposing an account the engine posts to by name |
| — | `trg_account_classification` | a subtype that belongs to a different statement type, or a sub-account under a parent of another type |

**Why R2 is deferred.** A plain `CHECK` cannot span rows, and an immediate trigger
would fire on the first line — when the journal is by definition unbalanced. A
`DEFERRABLE INITIALLY DEFERRED` constraint trigger fires once at COMMIT, so lines
may be inserted one at a time while an unbalanced journal remains impossible to
commit, from any client.

## Two bugs the triggers caught in my own code

Worth recording, because they are the argument for database-level enforcement:

1. `reverseJournal` posted the reversal and then *updated* it to record what it
   reversed. The immutability trigger refused — correctly. A journal is immutable
   from the moment it is written, including to the code that wrote it. Reversals
   now declare their link at creation.
2. `nextDocumentNumber` assumed snake_case columns. Prisma maps only *table* names;
   columns keep their camelCase field names and must be quoted in raw SQL.

## A consequence found during verification: an organisation with a ledger cannot be deleted

Removing the throwaway verification organisation was refused four separate times,
by four different guards:

1. `trg_journal_immutable` — a posted journal cannot be deleted.
2. `trg_journal_line_immutable` — nor can its lines.
3. `trg_journal_balanced` — removing lines leaves a journal momentarily unbalanced.
4. `trg_protect_system_accounts` — the chart's system accounts cannot be deleted,
   and `journal_lines → ledger_accounts` is `ON DELETE RESTRICT` (R10) besides.

Deleting it required disabling all four and unwinding the ledger from the leaves
inward. That is not a defect. **"Delete an organisation" is therefore not an
application feature and should not become one** — a ledger that can be erased by
a single cascade is not an audit trail. If a tenant ever genuinely must go, it is
a deliberate, logged, out-of-band operation, and it should be preceded by an
export.

## Design decisions worth knowing

- **Periods are created lazily.** Posting to a date in a year that does not exist
  yet creates the year and its thirteen periods. Nobody can be blocked from
  entering a transaction because an administrative step was skipped. *Closing* is
  still deliberate.
- **Period 0** is a single day, the day before the fiscal year opens. Opening
  balances land there, so they never sit inside a trading month and distort it.
- **Periods close in order and reopen in reverse.** Closing March while February
  is still open would let March's figures change without March ever being
  reopened.
- **A reversal is dated into the first open period** if the original month is
  closed. Correcting an error must not reopen a month that has been reported.
- **Reversed journals still count.** Reports include everything except `DRAFT`. A
  reversed journal is historical fact and its reversal sits alongside it; excluding
  one while keeping the other would leave every corrected entry counted once,
  backwards.
- **Balances are never stored.** Every figure is aggregated from posted lines, so
  there is nothing to drift and no rebuild job to run.
- **The report queries accept a transaction.** Hand-written SQL is the one part of
  the ledger TypeScript cannot vouch for, so it must be *run* to be trusted — and
  taking a `client` lets it run against real data inside a rolled-back test.

## Verification

`pnpm verify` — lint clean, typecheck clean, **88 tests**. `pnpm build` clean.
`pnpm db:verify` — all 10 integrity objects present.

### Ledger invariants proved against the database

`tests/ledger-integrity.test.ts` bypasses the posting engine entirely and attacks
the tables with raw SQL, because the engine's checks are a courtesy and the
database's are the guarantee.

| Attack | Result |
| --- | --- |
| line with both a debit and a credit | rejected by CHECK |
| negative amount | rejected by CHECK |
| zero-value line | rejected by CHECK |
| unbalanced journal, forced with `SET CONSTRAINTS ALL IMMEDIATE` | rejected, naming the exact difference |
| single-line journal | rejected |
| balanced journal built one line at a time | accepted — which is what deferral is for |
| `UPDATE journal_lines SET debit = 999` on a posted entry | rejected |
| `DELETE FROM journal_lines` on a posted entry | rejected |
| `DELETE FROM journals` on a posted entry | rejected |
| backdating a posted journal | rejected |
| `status = 'REVERSED'` alone | accepted — the one permitted transition |
| `status = 'REVERSED', memo = 'smuggled'` | rejected |
| journal dated outside its own period | rejected |
| raw insert into a closed period | rejected |
| line pointing at another organisation's account | rejected by composite FK |
| deleting a system account | rejected |
| repurposing a system account's `systemKey` | rejected |
| renaming a system account | accepted — the wording is the business's to choose |
| `REVENUE` account with a `BANK` subtype | rejected |

### Engine and reporting

`tests/posting-engine.test.ts` (16) and `tests/reporting.test.ts` (4) cover
numbering, lazy period creation, rounding, zero-line dropping, archived and
heading accounts, R7 dimensions, closed periods, idempotency, reversal mirroring
and re-reversal refusal — and check the trial balance, the register's running
balance and `balancesAsOf` against each other on the same data.

`tests/report-queries.test.ts` runs every hand-written query against the live
database, read-only.

## What Phase 2 deliberately does not do

- No customers, vendors, items or tax codes — Phase 3.
- No invoices, bills or payments — Phases 4 and 5. The AR and AP control accounts
  exist and are already protected, but nothing can post to them yet, which is why
  R7 has no way to be violated in normal use today.
- No profit and loss or balance sheet — Phase 8. The trial balance is here because
  it is the ledger's own self-check, not because it is a financial statement.
- No year-end close — Phase 9. `RETAINED_EARNINGS` exists and is untouched.
