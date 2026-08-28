import NextAuth from 'next-auth'

import { authConfig } from '@/auth.config'

/**
 * Next.js 16 network proxy (formerly `middleware.ts`).
 *
 * Instantiated from the edge-safe config only — no Prisma, no bcrypt — which is
 * what keeps this bundle inside the proxy runtime's limits. It is a redirect
 * convenience for signed-out users, never a security boundary: the authoritative
 * check is `requireOrgContext()` in the service layer, where the membership row
 * is reachable (ADR-0007).
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    // Everything except auth endpoints, static assets and image files.
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
