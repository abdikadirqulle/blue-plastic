# ADR-0009 — The build must not need secrets or a database

**Status:** Accepted · 2026-08-28

## Context
The first Vercel deployment failed with 41 TypeScript errors, all variations of
`Module '"@prisma/client"' has no exported member 'Role'`. The cause was not
TypeScript: `prisma generate` had never run, so the client was an empty stub and
every type derived from it vanished.

Reproducing the deployment in a clean clone surfaced two further failures behind
the first, each of which would have become the *next* red build:

1. `prisma generate` itself failed without `DATABASE_URL`, because
   `prisma.config.ts` resolved it eagerly with `env('DATABASE_URL')`. That broke
   `pnpm install` via `postinstall`.
2. `next build` failed without `DATABASE_URL` and `AUTH_SECRET`, because
   `lib/env.ts` validated at module scope and `server/db.ts` constructed a Prisma
   client at import. Next.js evaluates every page module while collecting page
   data, so both ran during the build.

## Decision
**A build produces artefacts. It does not need secrets, and it does not open a
connection.** Three changes enforce that:

- `build` is `prisma generate && next build`, and `postinstall` also generates.
  Generation is idempotent and cheap; relying on a cached `node_modules` to
  already contain a generated client is how this fails silently.
- `prisma.config.ts` omits `datasource` entirely when no URL is present rather
  than resolving one eagerly. `generate` never needs a connection; `migrate`,
  `db push` and `studio` still fail with Prisma's own clear message.
- `lib/env.ts` validates on first property access (via a `Proxy`), and
  `server/db.ts` constructs its client on first query.

## Rationale
Laziness costs nothing in safety here. Values are still validated before anything
can read one, and a misconfigured deployment still fails loudly with the same
message — at the first request that needs a variable rather than at build time,
where the failure is both cryptic and unnecessary.

Deferring client construction pays a second dividend: a serverless cold start no
longer builds a connection pool the request may never use.

## Consequences
`next build` succeeds on a checkout with no environment at all — verified by
cloning the repository, installing and building with `DATABASE_URL`, `DIRECT_URL`
and `AUTH_SECRET` all unset.

Environment variables are still required at **runtime**. On Vercel that means
`DATABASE_URL`, `DIRECT_URL` and `AUTH_SECRET` must exist for the deployment, not
for the build.
