# Phase 1 — Foundation & Identity

**Status:** ✅ Complete — 2026-08-28
**Depends on:** nothing
**Blocks:** every other phase

## Goal

A secure, fast, organisation-scoped application shell containing every primitive the
accounting phases depend on — and no accounting concepts at all.

The deliberate exclusion matters. Chart of accounts, journals and periods are Phase
2's entire subject; building them alongside auth and layout work is how the ledger
ends up with the care that a sidebar deserves.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 1.1 | Next.js 16 + TS strict + Tailwind v4 + shadcn/ui, root-level `app/`, `@/*` → repo root, ESLint layering rule | `tsconfig.json`, `eslint.config.mjs`, `app/globals.css` | ✅ |
| 1.2 | Prisma 7 wiring: `prisma.config.ts`, `@prisma/adapter-pg` client, env validation, db scripts | `prisma.config.ts`, `server/db.ts`, `lib/env.ts` | ✅ |
| 1.3 | Foundation schema + first migration | `prisma/schema.prisma`, `prisma/migrations/…_init_foundation` | ✅ |
| 1.4 | NextAuth v5 credentials + JWT + edge/node config split + `proxy.ts` | `auth.config.ts`, `auth.ts`, `proxy.ts`, `types/next-auth.d.ts` | ✅ |
| 1.5 | RBAC permission matrix and guards | `server/auth/permissions.ts`, `lib/roles.ts` | ✅ |
| 1.6 | `OrgContext` plumbing, tenant scoping, membership-version revocation | `server/auth/context.ts` | ✅ |
| 1.7 | Money + calendar-date primitives | `lib/money.ts`, `lib/date.ts` | ✅ |
| 1.8 | Error model, `ActionResult`, server-action wrapper | `server/errors.ts`, `server/action.ts` | ✅ |
| 1.9 | Audit log service (write-through, in-transaction) | `server/audit.ts`, `server/services/audit.service.ts` | ✅ |
| 1.10 | Document numbering with row-lock allocation | `server/sequences.ts` | ✅ |
| 1.11 | App shell: sidebar, mobile nav, topbar, user menu, theme, loading/error/empty states | `components/layout/*`, `components/data/*`, `app/(app)/*` | ✅ |
| 1.12 | Auth screens: sign in, first-run setup, sign out | `app/(auth)/*` | ✅ |
| 1.13 | Settings: organisation profile, accounting settings, users & roles, profile, activity log | `app/(app)/settings/*` | ✅ |
| 1.14 | TanStack Query provider + typed fetch helper + one real consumer | `components/providers.tsx`, `lib/api.ts`, `app/api/audit-logs/route.ts` | ✅ |
| 1.15 | Vitest + unit and integration tests | `vitest.config.mts`, `tests/`, `lib/*.test.ts`, `server/auth/permissions.test.ts` | ✅ |
| 1.16 | Seed script | `prisma/seed.ts` | ✅ |

## Data model delivered

`Organization`, `User`, `Membership`, `Account` (NextAuth), `Session`,
`VerificationToken`, `AuditLog`, `DocumentSequence`.

Migration: `prisma/migrations/20260828142957_init_foundation`.

## Permissions delivered

The full matrix is defined now, including accounting permissions that nothing checks
yet, so later phases add call sites rather than redesigning authorisation.

Roles: `OWNER`, `ADMIN`, `ACCOUNTANT`, `BOOKKEEPER`, `SALES`, `VIEWER`.

A test asserts the roles escalate monotonically — every permission a bookkeeper has,
an accountant has — so a future edit cannot accidentally give a junior role something
a senior one lacks.

## Exit criteria

- [x] First-run setup creates an organisation and its owner, and closes permanently afterwards
- [x] Sign in / sign out works; protected routes redirect when signed out
- [x] `/api/*` answers unauthenticated callers with JSON 401, not an HTML redirect
- [x] App shell renders responsively with working navigation, gated by permission
- [x] Organisation settings (profile, currency, fiscal year) editable and persisted
- [x] Users list with invite, role change, suspend and remove, gated by permission
- [x] Changing a role or status bumps `Membership.version`, invalidating issued JWTs
- [x] `pnpm verify` passes: lint, typecheck, 46 tests
- [x] Integration test proves cross-organisation reads return nothing
- [x] Audit rows are written for every mutation in this phase
- [x] `pnpm build` succeeds; every data-dependent route is server-rendered per request

## What Phase 1 deliberately does not do

- No chart of accounts, journals, periods or posting engine — Phase 2.
- No email delivery. An invited member is created with a password the inviter sets;
  Phase 10 replaces this with a signed invitation link. The action's shape does not
  change when it does.
- No multi-currency behaviour. The schema is currency-aware (ADR-0006); the app is
  single-currency.

## Verification

`pnpm verify` — lint clean, typecheck clean, 46 tests passing. `pnpm build` clean;
every data-dependent route renders per request.

### Signed out, against the live database

| Route | Result |
| --- | --- |
| `/` | 307 → `/setup` (no organisation exists) |
| `/sign-in` | 307 → `/setup` |
| `/setup` | 200, renders the first-run form |
| `/dashboard` | 307 → `/sign-in?callbackUrl=…` |
| `/api/audit-logs` | 401 `{"error":{"code":"UNAUTHENTICATED",…}}` — JSON, not an HTML redirect |

### Signed in

A temporary organisation and owner were created, every authenticated surface was
rendered with a real session, and the organisation was then deleted — the database
was confirmed empty afterwards (all counts zero).

| Check | Result |
| --- | --- |
| `POST /api/auth/callback/credentials` | 302 → `/dashboard`; session carries `orgId`, `role`, `membershipVersion` |
| `/dashboard`, `/settings/organization`, `/settings/users`, `/settings/profile`, `/settings/activity` | 200, correct organisation and user rendered |
| `GET /api/audit-logs` with session | 200, returns the `LOGIN` and `Organization CREATE` rows |
| `organizationService.update` | persisted, and wrote exactly one audit row attributed to the actor |
| `updateAccountingSettings` | currency and fiscal year changed while no journal exists |
| Owner guards | demoting or removing the owner rejected |
| Invite → promote → suspend → remove | `Membership.version` incremented 1 → 2 → 3, invalidating issued JWTs |

### Bugs found and fixed during verification

| Bug | Fix |
| --- | --- |
| Raw SQL in `nextDocumentNumber` assumed snake_case columns; Prisma only maps *tables* | Quote the camelCase column names; convention now documented in `03-database-design.md` |
| Prisma's 5s default transaction timeout is too short for a remote database — first-run setup failed partway | `transactionOptions: { maxWait: 10s, timeout: 30s }` on the client, matched in the seed |
| `/`, `/setup` and `/sign-in` were prerendered as static, freezing the setup redirect at build time | `export const dynamic = 'force-dynamic'` on all three |
| `/api/*` redirected unauthenticated callers to an HTML sign-in page | `proxy.ts` passes `/api/*` through; handlers return a JSON 401 envelope |
| A component imported role labels from `server/` | Labels moved to `lib/roles.ts`; the ESLint layering rule now has no exceptions |
