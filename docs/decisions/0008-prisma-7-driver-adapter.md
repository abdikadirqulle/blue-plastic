# ADR-0008 — Prisma 7: config file, driver adapter, pinned CLI

**Status:** Accepted · 2026-08-28

## Context
Prisma 7 changed three things this project depends on:

1. `url` and `directUrl` are no longer accepted in `schema.prisma`.
2. `PrismaClient` requires a driver adapter (or Accelerate) rather than an engine
   that opens its own connection.
3. `package.json#prisma` is no longer read; seed configuration moved to the config
   file.

Separately, `pnpm add -D prisma` resolved the `latest` tag to `8.0.0-rc.12` — a
release candidate — against `@prisma/client` 7.10.

## Decision
- Connection URLs live in `prisma.config.ts`. Migrations use `DIRECT_URL` (falling
  back to `DATABASE_URL`), because DDL cannot run through a transaction pooler.
- The client is built with `@prisma/adapter-pg` over node-postgres, with an
  explicit pool ceiling.
- `.env` is loaded by Node's built-in `process.loadEnvFile()`, not dotenv — Prisma
  7 no longer loads it and there is no reason to add a dependency for it.
- The CLI is **pinned to `prisma@7`** to match the client. A release candidate is
  not a foundation for a ledger.

## Consequences
Upgrading Prisma is now a deliberate, paired change (CLI + client + adapter)
rather than an incidental one. The driver adapter also means connection pooling is
ours to tune rather than the query engine's to assume.
