# Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 1 — Foundation & Identity | ✅ Complete | 2026-08-28 · [detail](./phases/phase-01-foundation.md) · migration `20260828142957_init_foundation` · lint + typecheck + 46 tests + build green |
| 2 — Accounting Core | ⚪ Not started | Chart of accounts, periods, journals, posting engine, integrity triggers, trial balance |
| 3 — Master Data & Tax | ⚪ Not started | |
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
