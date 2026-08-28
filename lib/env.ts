import { z } from 'zod'

/**
 * Fail fast and loudly at boot rather than mysteriously at the first query.
 * Imported by `server/db.ts` and `auth.ts`, so any process that touches the
 * database or issues a session validates its configuration first.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Non-pooled connection used by migrations. Optional: only pooled providers need it.
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters — generate one with `openssl rand -base64 32`'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
})

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`)
}

export const env = parsed.data
