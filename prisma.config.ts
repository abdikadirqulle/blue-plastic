import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 configuration.
 *
 * Connection URLs live here rather than in `schema.prisma`, and Prisma no longer
 * loads `.env` itself — Node's built-in loader does it, so no dotenv dependency.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // No .env file (CI, production) — the environment is already populated.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Migrations and introspection must use a direct connection: DDL cannot run
    // through a transaction pooler. Falls back to DATABASE_URL for plain servers.
    url: process.env.DIRECT_URL || env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
