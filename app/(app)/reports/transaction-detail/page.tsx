import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon, ScrollTextIcon } from 'lucide-react'
import type { JournalSourceType } from '@prisma/client'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ACCOUNT_SUBTYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  isDebitNormalType,
  JOURNAL_SOURCE_LABELS,
} from '@/lib/accounting-labels'
import { formatDate, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { generalLedger } from '@/server/accounting/balances'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import { resolveSources, sourceFor } from '@/server/services/journal-sources'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'
import { AccountSwitcher } from './account-switcher'

export const metadata: Metadata = { title: 'Transaction detail by account' }

/**
 * Transaction detail by account.
 *
 * The page every figure on every report leads to, and the reason drill-down is
 * worth having: a number on a profit and loss is an aggregate, and the only
 * useful next question is *what is it made of*. This answers it in the terms the
 * question was asked in — every transaction that touched the account in the
 * period, dated, typed, numbered, named, with both sides and a running balance —
 * and every row is a link to the document that caused it.
 *
 * So the whole chain is three clicks and never leaves the subject: profit and
 * loss → the sales account → the transactions in it → the invoice. It used to
 * land on the chart-of-accounts register, which is a maintenance screen that
 * happens to list postings; the difference is what the page is *for*, and
 * therefore what it puts in front of you and what it lets you change.
 */
export default async function TransactionDetailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)
  const currency = ctx.organization.baseCurrency

  const accountId = typeof query.account === 'string' ? query.account : undefined
  const chart = await accountService.selectableAccounts(ctx)

  if (!accountId) {
    return (
      <>
        <PageHeader
          title="Transaction detail by account"
          description="Every transaction that touched one account, with the document behind each."
        />
        <ReportControls
          period={settings.period}
          from={settings.range.from}
          to={settings.range.to}
          asOf={settings.asOf}
          basis={settings.basis}
          comparison={settings.comparison}
          controls={{ mode: 'range' }}
        />
        <Card>
          <CardContent className="p-4">
            <AccountSwitcher
              accounts={chart}
              value={null}
              from={settings.range.from}
              to={settings.range.to}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Choose an account, or reach this page by clicking a figure on the profit and loss,
              the balance sheet or the trial balance.
            </p>
          </CardContent>
        </Card>
      </>
    )
  }

  const account = await accountService.get(ctx, accountId).catch(() => null)
  if (!account) {
    return (
      <EmptyState
        icon={ScrollTextIcon}
        title="That account no longer exists"
        description="It may have been removed since the report was run."
      />
    )
  }

  const ledger = await generalLedger(ctx.orgId, accountId, settings.range)

  // What produced each line, in one batch per document family — so a row can
  // link straight to the invoice rather than to the journal in between.
  const sources = await resolveSources(
    ctx.orgId,
    ledger.entries.map((entry) => ({
      sourceType: entry.sourceType as JournalSourceType,
      sourceId: entry.sourceId,
    })),
  )

  const debitNormal = isDebitNormalType(account.type)
  const movement = ledger.closing.minus(ledger.opening)

  const backTo = typeof query.back === 'string' ? query.back : null

  return (
    <>
      {backTo ? (
        <Link href={backTo} className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
          <ArrowLeftIcon /> Back to the report
        </Link>
      ) : null}

      <PageHeader
        title="Transaction detail by account"
        description={`${account.code} · ${account.name} — ${ACCOUNT_TYPE_LABELS[account.type]} · ${
          ACCOUNT_SUBTYPE_LABELS[account.subtype]
        } · ${debitNormal ? 'debit' : 'credit'} balance`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range' }}
      />

      <div className="mb-4">
        <AccountSwitcher
          accounts={chart}
          value={accountId}
          from={settings.range.from}
          to={settings.range.to}
        />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary
          label={`Balance at ${formatDate(settings.range.from)}`}
          value={formatMoney(ledger.opening, currency)}
        />
        <Summary label="Movement in this period" value={formatMoney(movement, currency)} />
        <Summary
          label={`Balance at ${formatDate(settings.range.to)}`}
          value={formatMoney(ledger.closing, currency)}
          emphasis
        />
      </div>

      {ledger.entries.length === 0 ? (
        <EmptyState
          icon={ScrollTextIcon}
          title="Nothing touched this account in this period"
          description={`Showing ${formatDate(settings.range.from)} to ${formatDate(settings.range.to)}. Widen the dates, or pick another account.`}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Type</TableHead>
                  <TableHead className="w-32">Number</TableHead>
                  <TableHead className="w-44">Name</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="w-40">Split</TableHead>
                  <TableHead className="numeric w-32">Debit</TableHead>
                  <TableHead className="numeric w-32">Credit</TableHead>
                  <TableHead className="numeric w-36">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.entries.map((entry) => {
                  const source = sourceFor(sources, {
                    sourceType: entry.sourceType as JournalSourceType,
                    sourceId: entry.sourceId,
                  })

                  // The document if there is one, the journal if there is not.
                  // Either way the row leads somewhere that explains the figure.
                  const href = source.href ?? `/journals/${entry.journalId}`
                  const number = source.number ?? entry.journalNumber

                  const name = entry.partyName ?? source.partyName
                  const nameHref = entry.customerId
                    ? `/customers/${entry.customerId}`
                    : entry.vendorId
                      ? `/vendors/${entry.vendorId}`
                      : source.partyHref

                  return (
                    <TableRow key={entry.lineId}>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                        {formatDate(toCalendarDate(entry.date))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {JOURNAL_SOURCE_LABELS[entry.sourceType as JournalSourceType] ??
                          entry.sourceType}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={href}
                          className="tabular font-medium underline-offset-4 hover:underline"
                        >
                          {number}
                        </Link>
                        {entry.status === 'REVERSED' ? (
                          <Badge variant="outline" className="ml-1.5">
                            reversed
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="truncate">
                        {name ? (
                          nameHref ? (
                            <Link href={nameHref} className="underline-offset-4 hover:underline">
                              {name}
                            </Link>
                          ) : (
                            name
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{entry.description ?? entry.memo ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.contraAccounts}
                      </TableCell>
                      <TableCell className="numeric tabular">
                        {entry.debit.isZero() ? '' : formatMoney(entry.debit, currency)}
                      </TableCell>
                      <TableCell className="numeric tabular">
                        {entry.credit.isZero() ? '' : formatMoney(entry.credit, currency)}
                      </TableCell>
                      <TableCell className="numeric tabular font-medium">
                        {formatMoney(entry.balance, currency)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>
                    Total for {account.code} {account.name}
                  </TableCell>
                  <TableCell className="numeric tabular font-semibold">
                    {formatMoney(
                      ledger.entries.reduce((sum, entry) => sum.plus(entry.debit), ledger.opening.minus(ledger.opening)),
                      currency,
                    )}
                  </TableCell>
                  <TableCell className="numeric tabular font-semibold">
                    {formatMoney(
                      ledger.entries.reduce((sum, entry) => sum.plus(entry.credit), ledger.opening.minus(ledger.opening)),
                      currency,
                    )}
                  </TableCell>
                  <TableCell className="numeric tabular font-semibold">
                    {formatMoney(ledger.closing, currency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </Card>
      )}
    </>
  )
}

function Summary({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`tabular mt-0.5 ${emphasis ? 'text-lg font-semibold' : 'text-base'}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
