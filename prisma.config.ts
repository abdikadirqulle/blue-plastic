import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 configuration.
 *
 * Connection URLs live here rather than in `schema.prisma`, and Prisma no longer
 * loads `.env` itself — Node's built-in loader does it, so no dotenv dependency.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // No .env file (CI, Vercel) — the environment is already populated, or the
  // command being run does not need one.
}

/**
 * Migrations and introspection must use a *direct* connection: DDL cannot run
 * through a transaction pooler. Falls back to DATABASE_URL for a plain server.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',

  /**
   * Deliberately omitted when no URL is present, rather than resolved eagerly with
   * `env()`.
   *
   * `prisma generate` reads the schema and writes TypeScript — it never opens a
   * connection. Demanding a database URL from it breaks `pnpm install` (via
   * `postinstall`) and the build on any machine that has no database configured,
   * including a fresh CI checkout. Commands that genuinely need the connection —
   * `migrate`, `db push`, `studio` — still fail with Prisma's own clear message.
   */
  ...(url ? { datasource: { url } } : {}),

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
