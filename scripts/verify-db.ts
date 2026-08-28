/**
 * Assert that every ledger integrity object still exists in the connected
 * database.
 *
 * Prisma does not model triggers, so nothing in the ORM would notice if one were
 * dropped — by a hand-run migration, a database restore from a dump taken with
 * the wrong flags, or a well-meaning `prisma db push`. The ledger would keep
 * accepting writes and quietly stop being double-entry.
 *
 * Run after every deploy: `pnpm db:verify`.
 */
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

/** rule -> what breaks if it is missing */
const EXPECTED_TRIGGERS: { name: string; table: string; rule: string; protects: string }[] = [
  {
    name: 'trg_journal_balanced',
    table: 'journal_lines',
    rule: 'R2/R3',
    protects: 'every posted journal balances and has at least two lines',
  },
  {
    name: 'trg_journal_immutable',
    table: 'journals',
    rule: 'R4',
    protects: 'a posted journal cannot be edited or deleted',
  },
  {
    name: 'trg_journal_line_immutable',
    table: 'journal_lines',
    rule: 'R4',
    protects: 'the lines of a posted journal cannot be changed',
  },
  {
    name: 'trg_journal_period_open',
    table: 'journals',
    rule: 'R5/R6',
    protects: 'nothing posts into a closed period or outside its period',
  },
  {
    name: 'trg_journal_line_dimensions',
    table: 'journal_lines',
    rule: 'R7',
    protects: 'AR/AP lines carry their counterparty and journalDate stays honest',
  },
  {
    name: 'trg_protect_system_accounts',
    table: 'ledger_accounts',
    rule: 'R10',
    protects: 'system accounts cannot be deleted or repurposed',
  },
  {
    name: 'trg_account_classification',
    table: 'ledger_accounts',
    rule: '—',
    protects: 'an account subtype always matches its statement type',
  },
]

const EXPECTED_CONSTRAINTS: { name: string; table: string; rule: string; protects: string }[] = [
  {
    name: 'journal_lines_one_sided',
    table: 'journal_lines',
    rule: 'R1',
    protects: 'a line is a debit or a credit, never both, never negative',
  },
]

const EXPECTED_FOREIGN_KEYS: { name: string; rule: string; protects: string }[] = [
  {
    name: 'journal_lines_journal_org_fkey',
    rule: 'R9',
    protects: 'a line cannot reference another organisation\'s journal',
  },
  {
    name: 'journal_lines_account_org_fkey',
    rule: 'R9',
    protects: 'a line cannot reference another organisation\'s account',
  },
]

async function main() {
  const triggers = await db.$queryRaw<{ tgname: string; relname: string; tgdeferrable: boolean }[]>`
    SELECT t.tgname, c.relname, t.tgdeferrable
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname = current_schema()
  `

  const constraints = await db.$queryRaw<{ conname: string; relname: string; contype: string }[]>`
    SELECT con.conname, c.relname, con.contype::text
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
  `

  const failures: string[] = []
  const found = new Map(triggers.map((t) => [t.tgname, t]))
  const constraintNames = new Set(constraints.map((c) => c.conname))

  console.log('Ledger integrity objects\n')

  for (const expected of EXPECTED_TRIGGERS) {
    const actual = found.get(expected.name)
    if (!actual) {
      failures.push(`MISSING TRIGGER ${expected.name} (${expected.rule}) — ${expected.protects}`)
      console.log(`  ✗ ${expected.name.padEnd(30)} ${expected.rule.padEnd(7)} MISSING`)
      continue
    }
    if (actual.relname !== expected.table) {
      failures.push(`TRIGGER ${expected.name} is on ${actual.relname}, expected ${expected.table}`)
    }
    console.log(`  ✓ ${expected.name.padEnd(30)} ${expected.rule.padEnd(7)} ${expected.protects}`)
  }

  // The balance trigger is only a guarantee if it is deferred; an immediate one
  // would fire on the first line and make a balanced journal impossible to write.
  const balanced = found.get('trg_journal_balanced')
  if (balanced && !balanced.tgdeferrable) {
    failures.push(
      'trg_journal_balanced is not DEFERRABLE. It must fire at COMMIT, not per row, ' +
        'or no multi-line journal can ever be inserted.',
    )
  }

  for (const expected of [...EXPECTED_CONSTRAINTS, ...EXPECTED_FOREIGN_KEYS]) {
    if (!constraintNames.has(expected.name)) {
      failures.push(`MISSING CONSTRAINT ${expected.name} (${expected.rule}) — ${expected.protects}`)
      console.log(`  ✗ ${expected.name.padEnd(40)} ${expected.rule.padEnd(4)} MISSING`)
    } else {
      console.log(`  ✓ ${expected.name.padEnd(40)} ${expected.rule.padEnd(4)} ${expected.protects}`)
    }
  }

  console.log()

  if (failures.length > 0) {
    console.error('The ledger is NOT fully protected:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    console.error('\nRe-apply prisma/sql/ledger-integrity.sql before accepting any postings.')
    process.exitCode = 1
    return
  }

  console.log(
    `All ${EXPECTED_TRIGGERS.length + EXPECTED_CONSTRAINTS.length + EXPECTED_FOREIGN_KEYS.length} integrity objects present.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
