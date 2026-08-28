# 01 — Target Architecture

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Components by default) |
| Language | TypeScript, `strict` |
| Database | PostgreSQL 15+ |
| ORM | Prisma 7 (driver adapter, `prisma.config.ts`) |
| Auth | NextAuth v5 (Auth.js) — credentials + JWT session |
| Validation | Zod 4 — one schema shared by client form, server action and route handler |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (owned source, not a dependency) |
| Client data | TanStack Query v5 — only where a Server Component cannot do the job |
| Tests | Vitest (unit + integration against a real Postgres schema) |

## 2. Layering

Top-level directories, no `src/`:

```
  app/            Routing, layouts, pages, server actions   ← may import server/*
   │
  server/         All business logic. Never imported by a Client Component.
   ├── accounting/   Posting engine, balance rules, period guard   ← ONLY writer of the GL
   ├── services/     Domain services (invoices, bills, customers…) — transaction boundaries
   ├── auth/         Session, RBAC, org context
   └── db.ts         Prisma singleton
   │
  lib/            Isomorphic: Zod schemas, money, dates, roles, formatting, constants
  components/     Presentational + shadcn/ui primitives
```

Import direction is one-way and enforced by ESLint (`no-restricted-imports`):
`components/*` may never import `server/*`, with no exceptions beyond type-only
imports. That is why role *labels* live in `lib/roles.ts` while the permission
*matrix* stays in `server/auth/permissions.ts` — the rule stays absolute instead
of accumulating special cases.

**Why a service layer at all, rather than Prisma calls in pages?** Because a
posting rule that lives in a page cannot be reused by the import job, the recurring
transaction runner or the test suite — and an accounting rule that exists in two
places will eventually exist in two *different* places.

## 3. Data flow

There are exactly three ways data moves. Pick by the rules below; do not invent a
fourth.

### 3.1 Reads — Server Components call services directly

```tsx
// app/(app)/customers/page.tsx  — Server Component
const ctx = await requireOrgContext('customer:read')
const { rows, total } = await customerService.list(ctx, parseListParams(searchParams))
```

No `fetch`, no HTTP hop, no serialization tax, no waterfall. Filters, sort and
pagination live in the URL (`?page=2&q=acme&sort=name`), which makes every list
view shareable, back-button-correct and cacheable.

### 3.2 Mutations — Server Actions calling the same services

```ts
'use server'
export async function createCustomer(input: unknown): Promise<ActionResult<Customer>> {
  const ctx = await requireOrgContext('customer:create')
  const data = customerCreateSchema.parse(input)      // Zod, server-side, always
  const customer = await customerService.create(ctx, data)
  revalidateTag(tags.customers(ctx.orgId))
  return ok(customer)
}
```

Server Actions return a discriminated `ActionResult`, never throw across the
boundary, and are the only mutation path. No `POST /api/*` for first-party UI.

### 3.3 Route Handlers — only for machine consumers and live-filtering widgets

`/api/*` exists for: typeahead/combobox search, infinite-scroll registers, future
webhooks and future third-party integrations. These are the only places
TanStack Query is used.

**Rule:** if a page can render its data on the server, it must. TanStack Query is
for interaction, not for page load.

## 4. Multi-tenancy and request context

Every service function's first parameter is an `OrgContext`:

```ts
type OrgContext = {
  orgId: string
  userId: string
  role: Role
  permissions: ReadonlySet<Permission>
}
```

`orgId` is derived from the session **only**. A client-supplied organisation id is
ignored if present and logged as a security event if it disagrees with the session.
Every Prisma query in `server/services/*` includes `orgId` in its `where`; the
integration test suite asserts cross-tenant reads return nothing.

The product is operated by a single business today. Organisation scoping is built
in from the start anyway, because adding a tenant key to a populated ledger later is
a migration nobody wants to run. See
[ADR-0001](./decisions/0001-organisation-scoping.md).

## 5. Authentication and authorisation

- **NextAuth v5**, credentials provider, JWT session strategy.
- Split config: `auth.config.ts` is edge-safe and is what `proxy.ts` (Next.js 16's
  renamed middleware) instantiates; `auth.ts` adds the Prisma adapter and password
  verification and runs on Node only.
- `proxy.ts` redirects signed-out browsers to `/sign-in`. It explicitly does *not*
  intercept `/api/*`: a route handler must answer an unauthenticated caller with a
  JSON error envelope, not an HTML sign-in page.
- The JWT carries `userId`, `orgId`, `role` and a `membershipVersion`. Bumping the
  membership row's version invalidates stale tokens on the next request, so a
  revoked user does not keep access until token expiry.
- **Authorisation is permission-based, not role-based, at the call site.** Roles map
  to permission sets in one file (`server/auth/permissions.ts`). Code asks
  `requireOrgContext('journal:post')`, never `if (role === 'ADMIN')`.

## 6. Performance rules

1. Server Components by default. `'use client'` only for genuine interactivity, and
   pushed as far down the tree as possible (a client `<DataTableToolbar>` inside a
   server `<DataTable>`, not the other way round).
2. Every list endpoint is paginated with a hard `take` ceiling. Keyset pagination
   for registers and ledgers, offset pagination for admin tables.
3. No `SELECT *` through relations — explicit Prisma `select` on list queries.
4. Aggregates (trial balance, aging, P&L) are computed in SQL, never by loading
   rows into Node.
5. Report and list caching via `unstable_cache` keyed by
   `org:<id>:<entity>:<version>`, invalidated with `revalidateTag` from the service
   that mutated the data.
6. Route-level `loading.tsx` with skeletons matching final layout, so navigation is
   instant and layout does not shift.

## 7. Money and dates

- Money is `Decimal` end to end (`NUMERIC(19,4)` in Postgres). It is serialised to
  the client as a **string**, formatted for display, and never parsed back into a
  JavaScript `number`.
- Transaction dates are calendar dates (`@db.Date`), not timestamps. A 31 January
  invoice must be in January for every user in every timezone.
- Audit timestamps are `timestamptz`.

## 8. Error handling

`AppError` carries a stable `code`, an HTTP status and a user-safe message.
Unexpected errors are logged with a correlation id and surfaced as a generic
message. Server Actions convert everything to `ActionResult`; Route Handlers to a
`{ error: { code, message } }` envelope.

## 9. Auditability

Every mutating service writes an `AuditLog` row inside the same transaction as the
change: actor, entity, action, before/after JSON diff, timestamp, IP. The ledger is
append-only, so the audit log plus the journal history together answer "who changed
this number and when" without exception.
