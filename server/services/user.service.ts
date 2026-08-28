import 'server-only'

import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { db } from '@/server/db'
import { notFound, validation } from '@/server/errors'

export async function updateProfile(ctx: OrgContext, input: { name: string }) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true },
    })
    if (!before) throw notFound('User')

    const after = await tx.user.update({
      where: { id: ctx.userId },
      data: { name: input.name },
      select: { id: true, name: true, email: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'User', entityId: ctx.userId, action: 'UPDATE', before, after },
      meta,
    )
    return after
  })
}

export async function changePassword(
  ctx: OrgContext,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { passwordHash: true },
  })
  if (!user?.passwordHash) throw notFound('User')

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw validation('Your current password is not correct.', {
      currentPassword: ['Your current password is not correct.'],
    })
  }

  const passwordHash = await hashPassword(input.newPassword)
  const meta = await requestMeta()

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { passwordHash } })
    // Never log the hash, old or new — only that it changed.
    await writeAudit(
      tx,
      ctx,
      { entity: 'User', entityId: ctx.userId, action: 'UPDATE', after: { passwordChanged: true } },
      meta,
    )
  })

  return { ok: true as const }
}
