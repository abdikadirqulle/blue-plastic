import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { needsSetup } from '@/server/services/setup.service'

/**
 * Always render per request: this page's output depends on whether an
 * organisation exists and on the caller's session. Prerendering it would freeze
 * that decision at build time.
 */
export const dynamic = 'force-dynamic'

export default async function RootPage() {
  if (await needsSetup()) redirect('/setup')

  const session = await auth()
  redirect(session?.user ? '/dashboard' : '/sign-in')
}
