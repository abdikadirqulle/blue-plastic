# Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 1 — Foundation & Identity | ✅ Complete · deployed | 2026-08-28 · [detail](./phases/phase-01-foundation.md) · migration `20260828142957_init_foundation` · lint + typecheck + 46 tests + build green · Vercel build fixed, see [ADR-0009](./decisions/0009-build-must-not-need-secrets.md) |
| 2 — Accounting Core | ✅ Complete | 2026-08-28 · [detail](./phases/phase-02-accounting-core.md) · migrations `ledger_core`, `ledger_tenant_fks` · 10 integrity objects live · 88 tests |
| 3 — Master Data & Tax | ✅ Complete | 2026-08-29 · [detail](./phases/phase-03-master-data.md) · migrations `master_data` ×2 · 15 integrity objects · 137 tests |
| 4 — Sales / AR | ⚪ Not started | |
| 5 — Purchases / AP | ⚪ Not started | |
| 6 — Banking & Cash | ⚪ Not started | |
| 7 — Inventory | ⚪ Not started | |
| 8 — Reporting | ⚪ Not started | |
| 9 — Period Close & Year-End | ⚪ Not started | |
| 10 — Hardening & Polish | ⚪ Not started | |

Phases advance only on explicit instruction from the owner.

## Open items carried forward

| Item | Phase it lands in |
| --- | --- |
| Email delivery for invitations (currently the inviter sets a temporary password) | 10 |
| Multi-currency behaviour — the schema is already currency-aware | 10 |
| `account_period_balances` report rollup | 8 |
| Rate limiting on the sign-in endpoint | 10 |
