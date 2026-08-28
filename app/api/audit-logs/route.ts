import { NextResponse } from 'next/server'

import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import { isAppError } from '@/server/errors'
import * as auditService from '@/server/services/audit.service'

/**
 * One of the few route handlers in the application. The activity log is an
 * infinite list the user scrolls without navigating, which is precisely the case
 * a Server Component cannot serve (ADR-0004).
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireOrgContext('audit:read')
    const params = Object.fromEntries(new URL(request.url).searchParams)
    const page = await auditService.list(ctx, parseListQuery(params))

    return NextResponse.json({
      ...page,
      rows: page.rows.map((row) => ({ ...row, at: row.at.toISOString() })),
    })
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      )
    }
    console.error('[api/audit-logs]', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Request failed.' } },
      { status: 500 },
    )
  }
}
