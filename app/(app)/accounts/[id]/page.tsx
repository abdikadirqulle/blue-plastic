import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, ScrollTextIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ACCOUNT_SUBTYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  isDebitNormalType,
  JOURNAL_SOURCE_LABELS,
} from '@/lib/accounting-labels'
import { fiscalYearOf, fiscalYearRange, formatDate, toCalendarDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { readSort, SortableHeader } from '@/components/data/sortable-header'
import { generalLedger } from '@/server/accounting/balances'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import { resolveSources, sourceFor } from '@/server/services/journal-sources'
import type { JournalSourceType } from '@prisma/client'

const SORTABLE = ['date', 'entry', 'description', 'debit', 'credit'] as const

export const metadata: Metadata = { title: 'Account' }

/**
 * The account register: every posted line, oldest first, with a running balance.
 * This is the drill-down behind every figure on every report — if a number looks
 * wrong, this is the page that shows why.
 */
export default async function AccountRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('account:read')
  const { id } = await params
  const query = await searchParams

  const account = await accountService.get(ctx, id).catch(() => null)
  if (!account) notFound()

  const timeZone = ctx.organization.timeZone
  const currency = ctx.organization.baseCurrency
  const defaults = fiscalYearRange(
    fiscalYearOf(today(timeZone), ctx.organization.fiscalYearStartMonth),
    ctx.organization.fiscalYearStartMonth,
  )
  const from = typeof query.from === 'string' ? query.from : defaults.start
  const to = typeof query.to === 'string' ? query.to : defaults.end

  const ledger = await generalLedger(ctx.orgId, id, { from, to })

  // What produced each line, resolved in one batch per document family.
  //
  // This is the hop that makes a report answer its own question. A figure on the
  // profit and loss led here, and here used to lead only to the journal — so
  // tracing a number to the invoice that caused it took three screens, and the
  // middle one was the least informative of the three. The document and the
  // party it was with now sit on the register row itself.
  const sources = await resolveSources(
    ctx.orgId,
    ledger.entries.map((entry) => ({
      sourceType: entry.sourceType as JournalSourceType,
      sourceId: entry.sourceId,
    })),
  )

  // The running balance column only means anything in date order, so it is shown
  // as computed and never re-derived from a different ordering.
  const sort = readSort(query, SORTABLE, { sort: 'date', dir: 'asc' })
  const basePath = `/accounts/${id}`
  const linkParams = { from, to, sort: sort.sort, dir: sort.dir }
  const direction = sort.dir === 'asc' ? 1 : -1
  const entries = [...ledger.entries].sort((a, b) => {
    switch (sort.sort) {
      case 'entry':
        return direction * a.journalNumber.localeCompare(b.journalNumber)
      case 'description':
        return direction * (a.description ?? '').localeCompare(b.description ?? '')
      case 'debit':
        return direction * a.debit.comparedTo(b.debit)
      case 'credit':
        return direction * a.credit.comparedTo(b.credit)
      default:
        return direction * (a.date.getTime() - b.date.getTime())
    }
  })
  const debitNormal = isDebitNormalType(account.type)

  return (
    <>
      <Link
        href="/accounts"
        className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}
      >
        <ArrowLeftIcon /> Chart of accounts
      </Link>

      <PageHeader
        title={`${account.code} · ${account.name}`}
        description={`${ACCOUNT_TYPE_LABELS[account.type]} · ${ACCOUNT_SUBTYPE_LABELS[account.subtype]} · ${
          debitNormal ? 'debit' : 'credit'
        } balance`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label={`Opening ${formatDate(from)}`} value={formatMoney(ledger.opening, currency)} />
        <Summary
          label="Movement in range"
          value={formatMoney(ledger.closing.minus(ledger.opening), currency)}
        />
        <Summary label={`Closing ${formatDate(to)}`} value={formatMoney(ledger.closing, currency)} emphasis />
      </div>

      {account.description ? (
        <p className="mb-4 text-sm text-muted-foreground">{account.description}</p>
      ) : null}

      {ledger.entries.length === 0 ? (
        <EmptyState
          icon={ScrollTextIcon}
          title="Nothing posted to this account in this period"
          description={`Showing ${formatDate(from)} to ${formatDate(to)}.`}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader column="date" label="Date" state={sort} basePath={basePath} params={linkParams} className="w-28" />
                <SortableHeader column="entry" label="Entry" state={sort} basePath={basePath} params={linkParams} className="w-28" />
                <SortableHeader column="description" label="Description" state={sort} basePath={basePath} params={linkParams} />
                <TableHead className="w-40">Document</TableHead>
                <TableHead>Contra account</TableHead>
                <SortableHeader column="debit" label="Debit" state={sort} basePath={basePath} params={linkParams} className="w-32" numeric defaultDirection="desc" />
                <SortableHeader column="credit" label="Credit" state={sort} basePath={basePath} params={linkParams} className="w-32" numeric defaultDirection="desc" />
                <TableHead className="numeric w-36">
                  {sort.sort === 'date' && sort.dir === 'asc' ? 'Balance' : 'Balance (in date order)'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.lineId}>
                  <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                    {formatDate(toCalendarDate(entry.date))}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/journals/${entry.journalId}`}
                      className="tabular font-medium underline-offset-4 hover:underline"
                    >
                      {entry.journalNumber}
                    </Link>
                    {entry.status === 'REVERSED' ? (
                      <Badge variant="outline" className="ml-1.5">
                        reversed
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="block">{entry.description ?? entry.memo ?? '—'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {JOURNAL_SOURCE_LABELS[entry.sourceType as JournalSourceType] ?? entry.sourceType}
                    </span>
                  </TableCell>
                  <TableCell>
                    <SourceCell
                      source={sourceFor(sources, {
                        sourceType: entry.sourceType as JournalSourceType,
                        sourceId: entry.sourceId,
                      })}
                      partyName={entry.partyName}
                      customerId={entry.customerId}
                      vendorId={entry.vendorId}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.contraAccounts}</TableCell>
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
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>Closing balance</TableCell>
                <TableCell className="numeric tabular font-semibold">
                  {formatMoney(ledger.closing, currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
    </>
  )
}

/**
 * The document behind a register line, and who it was with.
 *
 * A manual entry has neither, and says so rather than showing an empty cell that
 * could equally mean "not loaded".
 */
function SourceCell({
  source,
  partyName,
  customerId,
  vendorId,
}: {
  source: { number: string | null; href: string | null; partyName: string | null; partyHref: string | null }
  partyName: string | null
  customerId: string | null
  vendorId: string | null
}) {
  // A control-account line carries its own counterparty, which is more precise
  // than the document's: a payment settling three invoices is one document with
  // one customer, but the line says whose balance moved.
  const name = partyName ?? source.partyName
  const nameHref = customerId
    ? `/customers/${customerId}`
    : vendorId
      ? `/vendors/${vendorId}`
      : source.partyHref

  if (!source.number && !name) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <>
      {source.number ? (
        source.href ? (
          <Link href={source.href} className="tabular block font-medium underline-offset-4 hover:underline">
            {source.number}
          </Link>
        ) : (
          <span className="tabular block font-medium">{source.number}</span>
        )
      ) : null}
      {name ? (
        nameHref ? (
          <Link href={nameHref} className="block text-xs text-muted-foreground underline-offset-4 hover:underline">
            {name}
          </Link>
        ) : (
          <span className="block text-xs text-muted-foreground">{name}</span>
        )
      ) : null}
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
