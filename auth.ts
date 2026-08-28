import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { z } from 'zod'

import { authConfig } from '@/auth.config'
import { db } from '@/server/db'
import { fakeVerify, verifyPassword } from '@/server/auth/password'
import { recordEvent } from '@/server/audit'
import { env } from '@/lib/env'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  secret: env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const email = parsed.data.email.trim().toLowerCase()
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
            memberships: {
              where: { status: 'ACTIVE' },
              select: { orgId: true, role: true, version: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        })

        // Equalise timing whether or not the account exists, so the response
        // does not enumerate registered addresses.
        if (!user?.passwordHash) {
          await fakeVerify()
          return null
        }

        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
          const membership = user.memberships[0]
          if (membership) {
            await recordEvent({
              orgId: membership.orgId,
              actorId: user.id,
              entity: 'User',
              entityId: user.id,
              action: 'LOGIN_FAILED',
            })
          }
          return null
        }

        // A user with no active membership has no organisation to sign in to.
        const membership = user.memberships[0]
        if (!membership) return null

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        await recordEvent({
          orgId: membership.orgId,
          actorId: user.id,
          entity: 'User',
          entityId: user.id,
          action: 'LOGIN',
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          orgId: membership.orgId,
          role: membership.role,
          membershipVersion: membership.version,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id
        token.orgId = user.orgId
        token.role = user.role
        token.membershipVersion = user.membershipVersion
      }

      // Refresh the claims when the client calls `useSession().update()` — used
      // after a role change so the user does not have to sign out and back in.
      if (trigger === 'update' && token.sub && token.orgId) {
        const membership = await db.membership.findUnique({
          where: { orgId_userId: { orgId: token.orgId as string, userId: token.sub } },
          select: { role: true, version: true, status: true },
        })
        if (membership && membership.status === 'ACTIVE') {
          token.role = membership.role
          token.membershipVersion = membership.version
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      session.user.orgId = token.orgId as string
      session.user.role = token.role as typeof session.user.role
      session.user.membershipVersion = token.membershipVersion as number
      return session
    },
  },
})
