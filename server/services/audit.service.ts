import 'server-only'
import type { Prisma } from '@prisma/client'

import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'

export async function list(ctx: OrgContext, query: ListQuery) {
  const where: Prisma.AuditLogWhereInput = {
    orgId: ctx.orgId,
    ...(query.q
      ? {
          OR: [
            { entity: { contains: query.q, mode: 'insensitive' } },
            { actor: { name: { contains: query.q, mode: 'insensitive' } } },
            { actor: { email: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        at: true,
        ipAddress: true,
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { at: 'desc' },
      ...paginate(query),
    }),
    db.auditLog.count({ where }),
  ])

  return paged(rows, total, query)
}
