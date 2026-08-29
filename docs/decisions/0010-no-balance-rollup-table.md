# ADR-0010 — Statements are computed, not cached

**Status:** Accepted · 2026-08-29 · Applies from Phase 8

## Decision
Every financial statement is computed from `journal_lines` on each request. The
`account_period_balances` rollup table sketched in the Phase 8 plan is **not**
built.

## Rationale
A rollup is a second copy of the ledger. It has to be written on every post,
reversal, period close and back-dated correction, and when it drifts the reports
are quietly wrong while the ledger is right — the single worst failure mode this
system can have. That price is worth paying only if the direct query is too slow.

Measured against the production database (Supabase, pooled connection, from a
development machine):

| Ledger size | accountFigures | P&L | Balance sheet | Cash flow |
| --- | --- | --- | --- | --- |
| 12 lines | 258 ms | 273 ms | 305 ms | 306 ms |
| 50,000 lines | 536 ms | 516 ms | 550 ms | 517 ms |

The 12-line row is almost entirely network round-trip: it is the floor, not the
query. A four-thousand-fold increase in ledger size costs roughly 270 ms of
actual work, and that is the worst case — no date filter, every account, the
whole ledger. A real statement covers one year.

Blue Plastic Center will not write 50,000 journal lines in a decade. Caching to
save 270 ms, at the cost of a denormalised balance that can disagree with the
ledger, is a bad trade.

## Consequences
Reports are always correct by construction: there is no cache to invalidate, no
rebuild command, and no reconciliation between two sources of the same number.

The measurement is the trigger, not the conclusion. If a statement exceeds
roughly two seconds on real data, the first move is a covering index on
`(orgId, accountId, journalDate)` — already present — and then a materialised
view refreshed on post, which keeps one source of truth rather than two. See
[04-roadmap.md](../04-roadmap.md), Phase 8.8.
