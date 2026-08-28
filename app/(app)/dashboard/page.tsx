import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon, BookOpenIcon, ScaleIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MONTHS } from '@/lib/constants'
import { fiscalYearOf, fiscalYearRange, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { trialBalance } from '@/server/accounting/balances'
import { requireOrgContext } from '@/server/auth/context'
import { ROLE_LABELS } from '@/lib/roles'
import { db } from '@/server/db'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireOrgContext()

  const year = fiscalYearRange(
    fiscalYearOf(today(ctx.organization.timeZone), ctx.organization.fiscalYearStartMonth),
    ctx.organization.fiscalYearStartMonth,
  )

  const [memberCount, recentActivity, accountCount, journalCount, ledger] = await Promise.all([
    db.membership.count({ where: { orgId: ctx.orgId, status: 'ACTIVE' } }),
    db.auditLog.findMany({
      where: { orgId: ctx.orgId },
      select: {
        id: true,
        entity: true,
        action: true,
        at: true,
        actor: { select: { name: true } },
      },
      orderBy: { at: 'desc' },
      take: 5,
    }),
    db.ledgerAccount.count({ where: { orgId: ctx.orgId, isActive: true } }),
    db.journal.count({ where: { orgId: ctx.orgId } }),
    trialBalance(ctx.orgId, { from: year.start, to: year.end }),
  ])

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ctx.user.name.split(' ')[0]}`}
        description={`${ctx.organization.name} · books in ${ctx.organization.baseCurrency} · fiscal year starts ${MONTHS[ctx.organization.fiscalYearStartMonth - 1]}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Accounts" value={String(accountCount)} icon={BookOpenIcon} />
        <StatCard label="Journal entries" value={String(journalCount)} icon={ScaleIcon} />
        <StatCard label="Your role" value={ROLE_LABELS[ctx.role]} icon={ShieldCheckIcon} />
        <StatCard label="Active members" value={String(memberCount)} icon={UsersIcon} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {ledger.balanced ? 'The ledger is in balance' : 'The ledger is out of balance'}
            </CardTitle>
            <CardDescription>
              Debits {formatMoney(ledger.totalDebit, ctx.organization.baseCurrency)} · credits{' '}
              {formatMoney(ledger.totalCredit, ctx.organization.baseCurrency)} for the fiscal year to date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {ledger.balanced
                ? 'Every posted entry balances, and the database will refuse any that does not. Sales, purchases and banking documents arrive in later phases; until then, entries are made by hand.'
                : 'This should be impossible. Check the trial balance before relying on any other figure.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/reports/trial-balance"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Trial balance <ArrowRightIcon />
              </Link>
              <Link href="/accounts" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Chart of accounts <ArrowRightIcon />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Every change is recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.entity}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.actor?.name ?? 'System'}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {entry.action.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-sm font-semibold tabular">{value}</span>
        </span>
      </CardContent>
    </Card>
  )
}
