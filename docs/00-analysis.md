# 00 — Repository Analysis

**Date:** 2026-08-28

## 1. Existing codebase

The working directory was **empty**. No source files, no `package.json`, no git
repository, no prior migrations or schema.

| Question | Finding |
| --- | --- |
| Existing architecture | None — greenfield |
| Reusable code | None |
| Problematic / legacy parts | None |
| Existing data to migrate | None |

Consequence: there is no legacy constraint on the design. Every decision below is
made on merit rather than compatibility, and the accounting core can be built
correctly from the first commit instead of retrofitted — which is the single most
important thing in a system of this kind, because a ledger that was built loosely
cannot be tightened later without a data migration that nobody can safely perform.

## 2. Environment

| Item | Value |
| --- | --- |
| Node | v24.14.1 |
| Package manager | pnpm 10.33.0 |
| Local PostgreSQL | not installed |
| Docker daemon | not running |
| Database | **Supabase-hosted Postgres**, owner-supplied `DATABASE_URL` (pooled) + `DIRECT_URL` (migrations) |
| Next.js | 16.3.3 — `app/` at the repository root, `proxy.ts` in place of `middleware.ts` |
| Prisma | 7.10 — connection URLs in `prisma.config.ts`, client via the `@prisma/adapter-pg` driver adapter |

`.env` is owner-managed and never read or written by tooling or by an assistant.
`.env.example` documents the required variables.

## 3. Business context assumptions

Blue Plastic Center is a goods-trading business. That drives three decisions that
a services-only business would not need:

1. **Inventory is in scope** and is a first-class phase (perpetual inventory,
   weighted-average cost, automatic COGS posting). Selling stock without moving
   inventory and COGS in the same journal produces a wrong gross margin, and gross
   margin is the number this business actually runs on.
2. **Items carry account mappings** (income, expense/COGS, inventory asset) so
   posting is driven by master data rather than by whoever is typing the invoice.
3. **Sales tax** is modelled as a liability with its own agency and return period,
   not as a percentage scribbled on a line.

Base reporting currency: **USD**. The schema is currency-aware from day one (see
[ADR-0006](./decisions/0006-multi-currency-readiness.md)) but only base currency is
implemented in the early phases.

## 4. Scope exclusions (owner-stated)

- Payroll
- Projects / job costing

Both are deliberately excluded from the data model as well as the UI, so no dead
columns are carried.
