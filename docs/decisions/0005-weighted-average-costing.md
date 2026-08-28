# ADR-0005 — Weighted-average inventory costing

**Status:** Accepted · 2026-08-28 · Applies from Phase 7

## Decision
Perpetual inventory valued at weighted-average cost.

## Rationale
FIFO requires maintaining cost layers and re-layering whenever a back-dated purchase
or sale is entered — which small businesses do constantly. Weighted average
recomputes from a running quantity and value with no layer bookkeeping, is
permitted under both IFRS and US GAAP, and is what QuickBooks Online itself uses
outside the US.

## Consequences
Cost of a specific unit is not traceable. If a later requirement (customs, lot
tracking) demands FIFO, the `inventory_transactions` ledger retains enough
information — quantity, unit cost, date, document — to rebuild layers.
