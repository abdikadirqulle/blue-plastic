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
 * One client per process, created on first query rather than on import.
 *
 * Deferring construction matters twice over: `next build` evaluates every page
 * module while collecting page data and must not need a database URL to do it,
 * and a serverless cold start should not pay for a connection pool the request
 * may never use.
 *
 * The dev-mode global is what stops Next.js's module re-evaluation from opening a
 * new pool on every file save until Postgres refuses the connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const getClient = (): PrismaClient => (globalForPrisma.prisma ??= createClient())

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient()
    const value = Reflect.get(client, property, client)
    // Model delegates (`db.user`) are objects; top-level methods (`db.$transaction`)
    // are functions and lose their receiver unless bound.
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/** The client type inside `db.$transaction(async (tx) => …)`. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
