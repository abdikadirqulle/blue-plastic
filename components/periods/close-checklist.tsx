import Link from 'next/link'
import { AlertTriangleIcon, CheckCircle2Icon, CircleAlertIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/date'
import type { CloseChecklist } from '@/server/accounting/close-checklist'

const ICON = {
  ok: CheckCircle2Icon,
  warning: CircleAlertIcon,
  blocked: AlertTriangleIcon,
} as const

const TONE = {
  ok: 'text-success',
  warning: 'text-warning',
  blocked: 'text-destructive',
} as const

/**
 * The checks are listed in severity order rather than in the order they were
 * run, because the one that matters is the one that is wrong.
 */
export function CloseChecklistCard({
  checklist,
  label,
  action,
}: {
  checklist: CloseChecklist
  label: string
  action?: React.ReactNode
}) {
  const rank = { blocked: 0, warning: 1, ok: 2 } as const
  const checks = [...checklist.checks].sort((a, b) => rank[a.severity] - rank[b.severity])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Before closing {label}</CardTitle>
        <CardDescription>
          {formatDate(checklist.from)} — {formatDate(checklist.to)} ·{' '}
          {checklist.blocked
            ? 'The books disagree with themselves. Fix this before closing anything.'
            : checklist.warnings === 0
              ? 'Everything is in order.'
              : `${checklist.warnings} thing${checklist.warnings === 1 ? '' : 's'} unfinished. Closing is still allowed.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2.5">
          {checks.map((check) => {
            const Icon = ICON[check.severity]
            return (
              <li key={check.key} className="flex items-start gap-2.5 text-sm">
                <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[check.severity]}`} />
                <span className="min-w-0">
                  <span className="block font-medium">{check.label}</span>
                  <span className="block text-muted-foreground">
                    {check.detail}
                    {check.href && check.severity !== 'ok' ? (
                      <>
                        {' '}
                        <Link href={check.href} className="underline underline-offset-4">
                          Take a look
                        </Link>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        {action}
      </CardContent>
    </Card>
  )
}
