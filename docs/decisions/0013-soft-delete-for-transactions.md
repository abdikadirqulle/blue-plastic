# ADR-0013 — Delete is a soft delete, and there is no second verb

**Status:** accepted · 2026-09-01
**Supersedes in part:** [ADR-0002](./0002-immutable-ledger.md), which stands, and
`lib/document-disposition.ts`, which is gone.

## The problem

The application had no delete. It had *void*, which reverses a posted entry and
keeps both, and it had *delete* for the narrow case of a record the ledger had
never seen. Which one a screen offered was worked out per record by
`dispositionOf`, and a third of the time the answer was "neither, because
something is applied to it".

That is a defensible reading of double-entry bookkeeping and an indefensible
piece of software. The owner's report was blunt: nothing can be deleted, and the
tables do not even show a Delete action. He was right. Somebody who enters a bill
twice on a Tuesday morning wants the second one gone. Offering them a vocabulary
lesson about reversal, and then refusing anyway because a payment happened to be
applied, is not bookkeeping rigour — it is the application declining to do its
job and blaming the accounting.

## The options

**Physical delete.** Remove the rows. Honest to the word, and it takes the
evidence with it: a figure that appeared on a report sent to the bank last month
becomes something nobody can reconstruct or explain. It also means dropping the
R4 immutability triggers, which are the reason anything in this ledger can be
trusted at all — and once they are gone they are gone for every future writer,
not just for the delete path.

**Void only, no delete.** What was there. Correct and unusable.

**Soft delete.** The record is marked and vanishes from the application; the row
stays in PostgreSQL, unedited.

## The decision

Soft delete, and **one verb in the interface**: Delete. No Void, no Reverse, no
branching on what the record happens to be. The person clicks Delete, the
transaction goes, and whatever has to happen underneath to make that safe is not
their vocabulary and not their problem.

Underneath:

- The record gets `deletedAt`, `deletedById`, `deleteReason`.
- Its journal moves to status `DELETED` with the same stamp. Nothing about the
  entry changes — no amount, no line, no date.
- A reversal of that journal is deleted with it. Leaving the mirror of a
  withdrawn entry behind is exactly backwards.
- Stock is the exception that has to be *moved* rather than hidden, because a
  position is a running total: the compensating movement is appended, exactly as
  it always was. Both sides then fall by the same amount, so the Inventory Asset
  account and the stock ledger still agree.
- Applications — the rows linking a payment to an invoice — are removed outright.
  A link to something withdrawn is not history, it is a dangling reference; and
  removing it is what puts the invoice back to outstanding and the payment back
  to unapplied, which is the true position once the other document is gone.

## Why the row can stay without the money staying

Because balances here are derived. There is no stored balance to correct and no
rebuild to run ([ADR-0010](./0010-no-balance-rollup-table.md)): every figure in
the system is an aggregate over journal lines. Adding `DELETED` to the list of
statuses those aggregates exclude removes the money from every report at once —
not report by report, but in the single definition of which journals count.

The filter is applied in three places and no others: the `j.status NOT IN
('DRAFT', 'DELETED')` join every ledger query already carried, a Prisma client
extension in `server/db.ts` that excludes deleted rows from the nine transaction
tables, and an explicit `"deletedAt" IS NULL` in the handful of hand-written
queries that read those tables directly. Seventy call sites is seventy chances to
forget, and the one that gets forgotten is the one that shows a deleted invoice
on a report.

## What the database still refuses

R4 is not relaxed, it is widened by exactly one transition, and the widening is
itself constrained:

- `POSTED → DELETED` and `REVERSED → DELETED`, permitted only when `deletedAt` is
  set in the same statement, and only when the rest of the row — compared as
  jsonb, so it covers columns added by future migrations — is byte-identical.
- `DELETED → anything` does not exist. A deleted entry cannot be edited and
  cannot be un-deleted by an UPDATE.
- `DELETE FROM journals` on a posted row is still refused outright, from the
  application and from psql alike.

Four tests in `tests/soft-delete.test.ts` drive each of those from raw SQL,
because a trigger nobody attacks is a trigger nobody has.

## What this costs

A deleted transaction is invisible but not gone, and there is currently no screen
that shows deleted records. The audit log holds every deletion with its reason
and its author, which is enough to answer "what happened to INV-00042" but
requires somebody to go and look. A "recently deleted" view is worth building and
is not built.

Numbers are not reissued. Deleting `INV-00042` does not free the number, and the
next invoice is `INV-00043`. A gap in a sequence is a non-event; a reused number
is an audit finding.
