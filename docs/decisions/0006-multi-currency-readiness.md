# ADR-0006 — Currency-aware schema, single-currency implementation

**Status:** Accepted · 2026-08-28

## Decision
Base currency is USD. `journals` carry `currencyCode` and `exchangeRate`;
`journal_lines` carry both base and foreign amounts. The general ledger is always in
base currency. Full multi-currency behaviour — customer/vendor currencies, revaluation,
realised and unrealised FX gain/loss — is deferred to Phase 10.

## Rationale
Retrofitting currency onto a posted ledger requires restating history, because the
rate that applied on each historical transaction was never recorded. Carrying the
columns from the start costs almost nothing; recovering them later is impossible.

## Consequences
Until Phase 10, `currencyCode` is always the organisation's base and `exchangeRate`
is always 1. The posting engine still writes them, so no backfill is ever needed.
