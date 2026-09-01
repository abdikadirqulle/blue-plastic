import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  ClockIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MONTHS } from '@/lib/constants'
import { fiscalYearOf, fiscalYearRange, formatDate, today } from '@/lib/date'
import { Decimal, formatMoney, ZERO } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import { accountFigures, CASH_SUBTYPES, sumBy } from '@/server/reports/framework'
import { profitAndLoss } from '@/server/reports/statements'
import * as payables from '@/server/services/payables.service'
import * as receivables from '@/server/services/receivables.service'

export const metadata: Metadata = { title: 'Dashboard' }

/**
 * The four questions an owner actually opens the books to answer: how much cash
 * is there, is the business making money, who owes us, and what do we owe.
 * Everything else is one click away rather than on this page.
 */
export default async function DashboardPage() {
  const ctx = await requireOrgContext()
  const currency = ctx.organization.baseCurrency
  const now = today(ctx.organization.timeZone)

  const year = fiscalYearRange(
    fiscalYearOf(now, ctx.organization.fiscalYearStartMonth),
    ctx.organization.fiscalYearStartMonth,
  )
  const yearToDate = { from: year.start, to: now }

  const [figures, pnl, arAging, apAging, recentActivity] = await Promise.all([
    accountFigures(ctx.orgId, { from: '1900-01-01', to: now }),
    profitAndLoss(ctx.orgId, yearToDate),
    receivables.aging(ctx, now),
    payables.aging(ctx, now),
    db.auditLog.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, entity: true, action: true, at: true, actor: { select: { name: true } } },
      orderBy: { at: 'desc' },
      take: 6,
    }),
  ])

  const cashAccounts = figures.filter((row) => CASH_SUBTYPES.includes(row.subtype))
  const cash = sumBy(cashAccounts, (row) => row.closing)

  // Overdue means past its due date. A balance that is not on a document has no
  // due date to be past, so it is not overdue — it is simply outstanding.
  const overdue = (buckets: Record<receivables.AgingBucket, Decimal>) =>
    receivables.OVERDUE_BUCKETS.reduce((total, bucket) => total.plus(buckets[bucket]), ZERO)

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ctx.user.name.split(' ')[0]}`}
        description={`${ctx.organization.name} · books in ${currency} · fiscal year to ${formatDate(now)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cash on hand"
          value={formatMoney(cash, currency)}
          hint={`across ${cashAccounts.length} account${cashAccounts.length === 1 ? '' : 's'}`}
          icon={WalletIcon}
          href="/banking"
        />
        <StatCard
          label="Net income, year to date"
          value={formatMoney(pnl.netIncome, currency)}
          hint={
            pnl.totalIncome.isZero()
              ? 'no income yet'
              : `on income of ${formatMoney(pnl.totalIncome, currency)}`
          }
          icon={pnl.netIncome.isNegative() ? TrendingDownIcon : TrendingUpIcon}
          tone={pnl.netIncome.isNegative() ? 'negative' : 'positive'}
          href="/reports/profit-loss"
        />
        <StatCard
          label="Owed to you"
          value={formatMoney(arAging.grandTotal, currency)}
          hint={`${formatMoney(overdue(arAging.totals), currency)} overdue`}
          icon={ClockIcon}
          href="/reports/ar-aging"
        />
        <StatCard
          label="You owe"
          value={formatMoney(apAging.grandTotal, currency)}
          hint={`${formatMoney(overdue(apAging.totals), currency)} overdue`}
          icon={BanknoteIcon}
          href="/reports/ap-aging"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Income and expenses, year to date</CardTitle>
            <CardDescription>
              {formatDate(year.start)} to {formatDate(now)} · accrual basis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Bar label="Income" amount={pnl.totalIncome} peak={peak(pnl)} currency={currency} tone="positive" />
            <Bar
              label="Cost of goods sold"
              amount={pnl.totalCogs}
              peak={peak(pnl)}
              currency={currency}
              tone="neutral"
            />
            <Bar
              label="Operating expenses"
              amount={pnl.totalOperatingExpenses}
              peak={peak(pnl)}
              currency={currency}
              tone="negative"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/reports/profit-loss" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Profit &amp; loss <ArrowRightIcon />
              </Link>
              <Link href="/reports/balance-sheet" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Balance sheet <ArrowRightIcon />
              </Link>
              <Link href="/reports/cash-flow" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Cash flow <ArrowRightIcon />
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

      {arAging.agrees && apAging.agrees ? null : (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              A subsidiary ledger disagrees with its control account. Check the{' '}
              <Link href="/reports/ar-aging" className="underline underline-offset-4">
                receivables
              </Link>{' '}
              and{' '}
              <Link href="/reports/ap-aging" className="underline underline-offset-4">
                payables
              </Link>{' '}
              ageing before relying on any other figure.
            </span>
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Fiscal year starts in {MONTHS[ctx.organization.fiscalYearStartMonth - 1]}.
      </p>
    </>
  )
}

function peak(pnl: { totalIncome: Decimal; totalCogs: Decimal; totalOperatingExpenses: Decimal }) {
  return Decimal.max(pnl.totalIncome.abs(), pnl.totalCogs.abs(), pnl.totalOperatingExpenses.abs())
}

function Bar({
  label,
  amount,
  peak,
  currency,
  tone,
}: {
  label: string
  amount: Decimal
  peak: Decimal
  currency: string
  tone: 'positive' | 'negative' | 'neutral'
}) {
  const width = peak.isZero() ? 0 : amount.abs().dividedBy(peak).times(100).toNumber()
  const colour =
    tone === 'positive' ? 'bg-success/70' : tone === 'negative' ? 'bg-destructive/60' : 'bg-primary/50'

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium">{formatMoney(amount, currency)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${width.toFixed(1)}%` }} />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardContent className="flex items-start gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span
              className={`block truncate text-lg font-semibold tabular ${
                tone === 'negative' ? 'text-destructive' : ''
              }`}
            >
              {value}
            </span>
            {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
