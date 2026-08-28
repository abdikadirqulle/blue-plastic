/**
 * Create a migration by diffing the live database against the schema.
 *
 * `prisma migrate dev` cannot be used on this project. It works through a shadow
 * database, which the hosted Postgres pooler will not provide, so it falls back
 * to asking to reset the development database — which here is the real one.
 *
 * `migrate diff` needs no shadow database. But it also has no knowledge of the
 * hand-written objects in `prisma/sql/`, so it emits `DROP` statements for them
 * as though they were drift. Those drops are stripped here, and the SQL files are
 * appended so a fresh database gets them from the migration itself.
 *
 *     pnpm db:new-migration add_something
 *     pnpm db:deploy
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const name = process.argv[2]
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: pnpm db:new-migration <snake_case_name>')
  process.exit(1)
}

const root = process.cwd()
const sqlDir = join(root, 'prisma', 'sql')

const raw = execFileSync(
  join(root, 'node_modules', '.bin', 'prisma'),
  ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)

/** Every constraint, trigger and index this project creates by hand. */
const ours = new Set<string>()
for (const file of readdirSync(sqlDir).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(sqlDir, file), 'utf8')
  for (const match of sql.matchAll(/ADD CONSTRAINT\s+([a-z0-9_]+)/gi)) ours.add(match[1])
  for (const match of sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER\s+([a-z0-9_]+)/gi)) ours.add(match[1])
  for (const match of sql.matchAll(/CREATE UNIQUE INDEX\s+([a-z0-9_]+)/gi)) ours.add(match[1])
}

/**
 * Drop the drops. A statement that removes one of our own objects is not a
 * migration — it is Prisma not knowing the object exists.
 */
const kept: string[] = []
let removed = 0

for (const statement of raw.split(/\n\n/)) {
  const target = statement.match(/DROP CONSTRAINT "([a-z0-9_]+)"/i)?.[1]
  if (target && ours.has(target)) {
    removed += 1
    continue
  }
  if (statement.trim()) kept.push(statement.trim())
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const dir = join(root, 'prisma', 'migrations', `${stamp}_${name}`)
mkdirSync(dir, { recursive: true })

const hand = readdirSync(sqlDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => `-- source: prisma/sql/${file}\n${readFileSync(join(sqlDir, file), 'utf8')}`)
  .join('\n\n')

writeFileSync(
  join(dir, 'migration.sql'),
  `${kept.join('\n\n')}\n\n` +
    '-- ===========================================================================\n' +
    '-- Hand-written objects Prisma does not model: triggers, composite foreign\n' +
    '-- keys, partial indexes. Re-applied here so a fresh database gets them, and\n' +
    '-- idempotent so re-applying is free. Source of truth: prisma/sql/\n' +
    '-- ===========================================================================\n\n' +
    `${hand}\n`,
)

console.log(`Created prisma/migrations/${stamp}_${name}/migration.sql`)
if (removed > 0) {
  console.log(`Stripped ${removed} DROP statement(s) that would have removed our own constraints.`)
}
console.log('Review it, then run: pnpm db:deploy')
