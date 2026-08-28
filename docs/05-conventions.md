# 05 — Code Conventions

## Directory layout

No `src/` — everything sits at the repository root, which is where Next.js 16
looks for `app/` and `proxy.ts` by default.

```
app/
  (auth)/                 sign-in, setup — no app shell
  (app)/                  everything behind auth — sidebar shell
    dashboard/
    settings/
  api/                    route handlers (machine consumers, live search)
components/
  ui/                     shadcn/ui primitives (owned source)
  layout/                 shell, sidebar, mobile nav, user menu
  forms/                  field, submit button, form state adapters
  data/                   page header, pagination, search, empty/skeleton states
  providers.tsx           the single global client boundary
server/
  accounting/             posting engine (P2+)
  services/               domain services
  auth/                   context, permissions, password
  db.ts  audit.ts  sequences.ts  errors.ts  action.ts
lib/
  money.ts  date.ts  roles.ts  constants.ts  utils.ts  api.ts  env.ts
  validation/             Zod schemas shared by client and server
prisma/
  schema.prisma  seed.ts  migrations/
tests/                    integration tests + vitest setup
docs/
auth.ts  auth.config.ts  proxy.ts  prisma.config.ts   (repository root)
```

`proxy.ts` is Next.js 16's replacement for `middleware.ts`. It exports the
NextAuth handler as its default export plus a `config.matcher`.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `journal-line-form.tsx` |
| React components | PascalCase | `JournalLineForm` |
| Server actions | verb-first | `createInvoice`, `postJournal` |
| Zod schemas | `<entity><Action>Schema` | `invoiceCreateSchema` |
| Prisma models | PascalCase singular | `JournalLine` |
| Tables | snake_case plural | `journal_lines` |
| Permissions | `resource:action` | `invoice:create` |

## Server Actions

Every action is wrapped. The wrapper resolves context, checks the permission,
validates input with Zod, catches `AppError`, and returns a discriminated result:

```ts
export const createCustomer = action
  .permission('customer:create')
  .input(customerCreateSchema)
  .handler(async (ctx, input) => customerService.create(ctx, input))
```

Actions never throw to the client and never return a Prisma object directly —
`Decimal` and `Date` are serialised explicitly.

## Zod

One schema per operation, in `lib/validation/`, imported by both the client form
(`react-hook-form` + `zodResolver`) and the server action. Money fields are
validated as decimal **strings**, not numbers, and coerced to `Decimal`
server-side.

## Components

- Server Component unless it needs state, effects, or event handlers.
- `'use client'` goes on the smallest possible leaf.
- No data fetching in Client Components except through TanStack Query against
  `/api/*`, and only for typeahead and infinite registers.
- Every list route ships `loading.tsx` (skeleton matching final layout),
  `error.tsx`, and an explicit empty state with the primary action in it.

## Tables

One `DataTable` in `components/data/`. URL-driven state (`page`, `pageSize`, `q`,
`sort`, filters). Server-side pagination always — no client-side sort over a full
table pull.

## Money in the UI

`Decimal` → string at the service boundary → `formatMoney(value, currency)` for
display → parsed back to `Decimal` only on the server. A money value never becomes a
JavaScript `number` at any point in its life.

## Tests

| Kind | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | money, dates, permissions, posting builders, tax computation |
| Integration | Vitest + real Postgres | services, triggers, tenant isolation, posting engine |
| Accounting property tests | Vitest | every generated journal balances; reversal nets to zero |

Integration tests run against a dedicated schema and roll back per test. Trigger
behaviour is tested by attempting the violation with raw SQL, not just through the
service — the point is to prove the database refuses, not that the service does.

## Scripts

```
pnpm dev            next dev
pnpm build          next build
pnpm lint           eslint
pnpm typecheck      tsc --noEmit
pnpm test           vitest run
pnpm verify         lint + typecheck + test        <- run before every hand-off
pnpm db:push        prisma db push (dev only)
pnpm db:migrate     prisma migrate dev
pnpm db:deploy      prisma migrate deploy
pnpm db:studio      prisma studio
pnpm db:seed        seed organisation + owner
pnpm db:generate    prisma generate
pnpm db:reset       prisma migrate reset
pnpm db:verify      assert all expected triggers/constraints exist   (P2+)
```

## Commit / documentation discipline

At the end of every phase: update `docs/progress.md`, add an ADR for any decision
that a future reader would otherwise have to reverse-engineer, and mark the phase's
task table complete with what was verified and what was not.
