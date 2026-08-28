/**
 * Re-apply every hand-written database object in `prisma/sql/`.
 *
 * Prisma does not model triggers, functions, partial indexes or composite foreign
 * keys, so it reads them as drift and generates a DROP for them on the next
 * `migrate dev`. That is not a bug in Prisma — it is the cost of expressing rules
 * it has no vocabulary for — but it means a migration can silently take the
 * ledger's guarantees away.
 *
 * Every file here is written to be idempotent (`DROP ... IF EXISTS`,
 * `CREATE OR REPLACE`), so running this after any migration is safe and cheap.
 * `pnpm db:verify` then proves it worked.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

try {
  process.loadEnvFile('.env')
} catch {
  // Environment already populated.
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/**
 * Split on semicolons that end a statement, leaving those inside `$$ ... $$`
 * function bodies alone — a plpgsql body is full of them.
 */
function statements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let inDollar = false

  for (const line of sql.split('\n')) {
    const dollars = (line.match(/\$\$/g) ?? []).length
    current += line + '\n'
    if (dollars % 2 === 1) inDollar = !inDollar
    if (!inDollar && line.trimEnd().endsWith(';')) {
      const trimmed = current.trim()
      if (trimmed && !trimmed.split('\n').every((l) => l.trim().startsWith('--'))) out.push(trimmed)
      current = ''
    }
  }

  const tail = current.trim()
  if (tail && !tail.split('\n').every((l) => l.trim().startsWith('--'))) out.push(tail)
  return out
}

async function main() {
  const dir = join(process.cwd(), 'prisma', 'sql')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')
    const parts = statements(sql)
    process.stdout.write(`${file}: ${parts.length} statements … `)
    for (const statement of parts) {
      await db.$executeRawUnsafe(statement)
    }
    console.log('applied')
  }

  console.log('\nDatabase hardened. Run `pnpm db:verify` to confirm.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
