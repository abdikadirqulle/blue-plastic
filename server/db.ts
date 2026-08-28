import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { env } from '@/lib/env'

/**
 * Prisma 7 takes its connection through a driver adapter rather than a URL in the
 * schema. `@prisma/adapter-pg` wraps node-postgres, which also gives us a real
 * connection pool we can size.
 */
function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Serverless-friendly ceiling. Raise it for a long-lived Node server.
    max: 10,
  })

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    // Prisma's 5s default assumes a database on the same machine. Ours is remote,
    // and the transactions that matter here are multi-statement by nature — a
    // document and its journal must commit together or not at all. First-run setup
    // alone writes an organisation, a user, a membership and fifteen sequences.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
}

/**
 * A single client per process. Next.js dev mode re-evaluates modules on every
 * change, which without this would open a new pool per edit until Postgres
 * refuses the connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? createClient()

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/** The client type inside `db.$transaction(async (tx) => …)`. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
