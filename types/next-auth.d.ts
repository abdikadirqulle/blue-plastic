import type { Role } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      orgId: string
      role: Role
      membershipVersion: number
    } & DefaultSession['user']
  }

  interface User {
    orgId: string
    role: Role
    membershipVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    orgId?: string
    role?: Role
    membershipVersion?: number
  }
}
