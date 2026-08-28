# ADR-0002 — Immutable ledger, mutable documents

**Status:** Accepted · 2026-08-28

## Context
QuickBooks Online lets a user edit a posted invoice in place and silently rewrites
the underlying ledger effect. It is convenient and it is why QBO audit trails are
hard to trust.

## Decision
Posted journals are append-only and enforced immutable by database trigger.
Documents remain editable; editing a posted document reverses its journal and posts
a new one.

## Rationale
An accounting system's value is that last month's numbers do not change after you
report them. Immutability at the database level means that guarantee survives a bug
in application code, a migration script, and a direct psql session.

## Consequences
More journals per document. Reports must filter `status = 'POSTED'` and treat
reversal pairs as netting. Journal volume roughly doubles for heavily-edited
documents — acceptable, and the drill-down UI shows the document, not the journals,
by default.
