# Progress

| Phase                       | Status                 | Notes                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation & Identity   | ✅ Complete · deployed | 2026-08-28 · [detail](./phases/phase-01-foundation.md) · migration `20260828142957_init_foundation` · lint + typecheck + 46 tests + build green · Vercel build fixed, see [ADR-0009](./decisions/0009-build-must-not-need-secrets.md) |
| 2 — Accounting Core         | ✅ Complete            | 2026-08-28 · [detail](./phases/phase-02-accounting-core.md) · migrations `ledger_core`, `ledger_tenant_fks` · 10 integrity objects live · 88 tests                                                                                    |
| 3 — Master Data & Tax       | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-03-master-data.md) · migrations `master_data` ×2 · 15 integrity objects · 137 tests                                                                                                              |
| 4 — Sales / AR              | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-04-sales.md) · migration `sales` · 25 integrity objects · 173 tests                                                                                                                              |
| 5 — Purchases / AP          | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-05-purchases.md) · migration `purchases` · 35 integrity objects · 196 tests                                                                                                                      |
| 6 — Banking & Cash          | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-06-banking.md) · migration `banking` · 45 integrity objects · 212 tests                                                                                                                          |
| 7 — Inventory               | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-07-inventory.md) · migration `inventory` · 51 integrity objects · 226 tests                                                                                                                      |
| 8 — Reporting               | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-08-reporting.md) · no migration — reports read the ledger · 51 integrity objects · 272 tests · [ADR-0010](./decisions/0010-no-balance-rollup-table.md)                                          |
| 9 — Period Close & Year-End | ✅ Complete            | 2026-08-29 · [detail](./phases/phase-09-period-close.md) · migration written, not yet applied · 56 integrity objects · [ADR-0011](./decisions/0011-closing-entries-excluded-from-the-profit-and-loss.md)                                |
| 10 — Interface & Hardening  | ✅ Complete            | 2026-08-31 · [detail](./phases/phase-10-hardening.md) · no migration · [ADR-0012](./decisions/0012-owned-combobox-and-dialog.md) · 292 tests · second pass 10.12–10.22: deletion, stock reversal on void/edit, account selectors, reports, statements, Odoo-style visual system · not clicked through in a browser |

Phases advance only on explicit instruction from the owner.

## Open items carried forward

| Item                                                                                  | Phase it lands in |
| ------------------------------------------------------------------------------------- | ----------------- |
| Email delivery for invitations (currently the inviter sets a temporary password)      | 10                |
| Multi-currency behaviour — the schema is already currency-aware                       | 10                |
| Rate limiting on the sign-in endpoint                                                 | 10                |
| An end-to-end test through `voidDocument` asserting `stockAgreesWithLedger`           | 10                |
| End-to-end browser tests — nothing in Phase 10 has been clicked through                | 10                |

## Second pass over Phase 10 — 2026-08-31

Eleven areas reported as broken or missing, all of them inside Phase 10's remit
(interface and hardening) rather than a new phase. Detail in
[phase-10-hardening.md](./phases/phase-10-hardening.md), tasks 10.12–10.22.

Two were real accounting defects rather than interface problems, and both are
worth knowing about:

1. **Voiding or editing a document reversed its journal but not its stock**
   (10.13). The general ledger and the stock ledger then disagreed about what the
   business owned, and every edit of a bill inflated the stock further.
2. **A document carrying the same item twice costed both lines at the first
   line's amount** (10.13), so the second was received into stock at the wrong
   value.

Everything else was the interface refusing to let somebody do something the
ledger was perfectly happy with: no way to delete a draft, no way to undo a
transfer, no way to sell a tracked item, no way to pay a bill out of petty cash.
