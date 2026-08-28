import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { JOURNAL_SOURCE_LABELS, PERIOD_STATUS_LABELS } from '@/lib/accounting-labels'
import { formatDate, formatDateTime, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as journalService from '@/server/services/journal.service'
import { ReverseDialog } from './reverse-dialog'

export const metadata: Metadata = { title: 'Journal entry' }

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext('journal:read')
  const { id } = await params

  const journal = await journalService.get(ctx, id).catch(() => null)
  if (!journal) notFound()

  const currency = ctx.organization.baseCurrency
  const canReverse = ctx.permissions.has('journal:reverse') && journal.status === 'POSTED'

  return (
    <>
      <Link href="/journals" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Journal entries
      </Link>

      <PageHeader
        title={journal.journalNumber}
        description={journal.memo ?? undefined}
        actions={
          canReverse ? (
            <ReverseDialog
              journalId={journal.id}
              journalNumber={journal.journalNumber}
              defaultDate={toCalendarDate(journal.date)}
            />
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Date" value={formatDate(toCalendarDate(journal.date))} />
        <Detail
          label="Source"
          value={JOURNAL_SOURCE_LABELS[journal.sourceType] ?? journal.sourceType}
        />
        <Detail
          label="Period"
          value={`${formatDate(toCalendarDate(journal.period.startDate))} — ${PERIOD_STATUS_LABELS[journal.period.status]}`}
        />
        <Detail label="Posted" value={formatDateTime(journal.postedAt, ctx.organization.timeZone)} />
      </div>

      {journal.status === 'REVERSED' && journal.reversedBy ? (
        <Notice>
          This entry was reversed by{' '}
          <Link href={`/journals/${journal.reversedBy.id}`} className="font-medium underline underline-offset-4">
            {journal.reversedBy.journalNumber}
          </Link>{' '}
          on {formatDate(toCalendarDate(journal.reversedBy.date))}. Both remain in the ledger and cancel out.
        </Notice>
      ) : null}

      {journal.reversalOf ? (
        <Notice>
          This is the reversal of{' '}
          <Link href={`/journals/${journal.reversalOf.id}`} className="font-medium underline underline-offset-4">
            {journal.reversalOf.journalNumber}
          </Link>
          {journal.reversalReason ? ` — ${journal.reversalReason}` : null}.
        </Notice>
      ) : null}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="numeric w-36">Debit</TableHead>
              <TableHead className="numeric w-36">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular text-muted-foreground">{line.lineNumber}</TableCell>
                <TableCell>
                  <Link
                    href={`/accounts/${line.account.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    <span className="tabular text-muted-foreground">{line.account.code}</span>{' '}
                    {line.account.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{line.description ?? '—'}</TableCell>
                <TableCell className="numeric tabular">
                  {line.debit === '0' ? '' : formatMoney(line.debit, currency)}
                </TableCell>
                <TableCell className="numeric tabular">
                  {line.credit === '0' ? '' : formatMoney(line.credit, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                Totals
                {journal.balanced ? null : (
                  <Badge variant="destructive" className="ml-2">
                    out of balance
                  </Badge>
                )}
              </TableCell>
              <TableCell className="numeric tabular font-semibold">
                {formatMoney(journal.totalDebit, currency)}
              </TableCell>
              <TableCell className="numeric tabular font-semibold">
                {formatMoney(journal.totalCredit, currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Posted entries cannot be edited or deleted, by this application or by anything else with access to
        the database. Corrections are reversals.
      </p>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
      </CardContent>
    </Card>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
