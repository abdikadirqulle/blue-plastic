import 'server-only'
import { headers } from 'next/headers'
import type { AuditAction, Prisma } from '@prisma/client'

import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'

type AuditInput = {
  entity: string
  entityId: string
  action: AuditAction
  before?: unknown
  after?: unknown
}

/** Fields that must never reach the audit log, even in a "before" snapshot. */
const REDACT = new Set(['passwordHash', 'password', 'token', 'sessionToken', 'refresh_token', 'access_token', 'id_token'])

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined
  const json = JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (REDACT.has(key)) return '[redacted]'
      return typeof v === 'bigint' ? v.toString() : v
    }),
  )
  return json as Prisma.InputJsonValue
}

/**
 * Write an audit row inside the caller's transaction, so a change and its record
 * of the change commit or roll back together. There is no code path that mutates
 * data and leaves the audit trail behind.
 */
export async function writeAudit(
  tx: Tx,
  ctx: OrgContext,
  input: AuditInput,
  request?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorId: ctx.userId,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      before: sanitize(input.before),
      after: sanitize(input.after),
      ipAddress: request?.ip ?? null,
      userAgent: request?.userAgent ?? null,
    },
  })
}

/**
 * Audit an event that has no transaction of its own — sign-in, sign-out, a failed
 * password attempt. Never let a logging failure break the flow it is observing.
 */
export async function recordEvent(input: {
  orgId: string
  actorId?: string | null
  entity: string
  entityId: string
  action: AuditAction
  after?: unknown
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId ?? null,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        after: sanitize(input.after),
      },
    })
  } catch (error) {
    console.error('[audit] failed to record event', error)
  }
}

/** Best-effort request metadata for audit rows written from a server action. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    return {
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
      userAgent: h.get('user-agent'),
    }
  } catch {
    return { ip: null, userAgent: null }
  }
}
