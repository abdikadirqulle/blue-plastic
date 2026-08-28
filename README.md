# Blue Plastic Center

A double-entry accounting system — QuickBooks Online in scope, excluding payroll and
projects. Next.js 16, TypeScript, PostgreSQL, Prisma 7, NextAuth v5, Zod, Tailwind
CSS v4, shadcn/ui, TanStack Query.

## Start here

**[`docs/`](./docs)** holds the roadmap, architecture, accounting design and phase
plan. Read [`docs/02-accounting-design.md`](./docs/02-accounting-design.md) before
changing anything that touches the ledger.

Current status: **[Phase 1 complete](./docs/progress.md)** — foundation and identity.
The accounting engine arrives in Phase 2.

## Running it

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
pnpm db:migrate
pnpm dev
```

Then open <http://localhost:3000>. With an empty database you land on `/setup`,
which creates the organisation and its owner. That screen closes permanently once an
organisation exists.

`AUTH_SECRET` is generated with `openssl rand -base64 32`.

### Scripts

| | |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | the app |
| `pnpm verify` | lint + typecheck + tests — run before every hand-off |
| `pnpm test` | Vitest (unit + integration; integration needs `DATABASE_URL`) |
| `pnpm db:migrate` / `db:deploy` / `db:studio` / `db:seed` / `db:reset` | Prisma |

Integration tests run every case inside a transaction that is deliberately rolled
back, so they leave nothing behind in the database they run against.

## Layout

No `src/`. `app/` (routes), `components/`, `lib/` (isomorphic), `server/` (all
business logic), `prisma/`, `tests/`, `docs/`, with `auth.ts`, `auth.config.ts`,
`proxy.ts` and `prisma.config.ts` at the root.

Import direction is one-way and enforced by ESLint: `components/` may never import
`server/` except as types.

## The rules that are not negotiable

1. Nothing writes to the general ledger except the posting engine.
2. Posted journals are immutable — corrections are reversals, enforced by database
   trigger.
3. Every query is organisation-scoped, and `orgId` comes from the session.
4. Money is `NUMERIC(19,4)` and `Decimal`. Never a float. Never a `number`.
