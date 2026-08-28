import type { Metadata } from 'next'
import Link from 'next/link'
import { FileTextIcon, PlusIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { JOURNAL_SOURCE_LABELS } from '@/lib/accounting-labels'
import { formatDate, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as journalService from '@/server/services/journal.service'
import type { JournalSourceType } from '@prisma/client'

export const metadata: Metadata = { title: 'Journal entries' }

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('journal:read')
  const query = parseListQuery(await searchParams)
  const { rows, total, page, pageCount, pageSize } = await journalService.list(ctx, query)

  const canPost = ctx.permissions.has('journal:post')
  const currency = ctx.organization.baseCurrency

  const newEntry = canPost ? (
    <Link href="/journals/new" className={buttonVariants({ size: 'sm' })}>
      <PlusIcon /> New entry
    </Link>
  ) : undefined

  return (
    <>
      <PageHeader
        title="Journal entries"
        description="Every posting in the ledger, whatever produced it. Entries are never edited — a correction is a reversal, and both stay on the record."
        actions={newEntry}
      />

      <div className="mb-4">
        <SearchInput placeholder="Search by number or description" />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title={query.q ? 'No entries match that search' : 'Nothing posted yet'}
          description={
            query.q
              ? 'Try a different number or description.'
              : 'Manual journals go here, alongside everything the system posts from invoices, bills and payments.'
          }
          action={!query.q ? newEntry : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Entry</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="numeric w-32">Amount</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((journal) => (
                <TableRow key={journal.id}>
                  <TableCell>
                    <Link
                      href={`/journals/${journal.id}`}
                      className="tabular font-medium underline-offset-4 hover:underline"
                    >
                      {journal.journalNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                    {formatDate(toCalendarDate(journal.date))}
                  </TableCell>
                  <TableCell>
                    {journal.memo ?? <span className="text-muted-foreground">—</span>}
                    {journal.isAdjusting ? (
                      <Badge variant="outline" className="ml-2">
                        adjusting
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {JOURNAL_SOURCE_LABELS[journal.sourceType as JournalSourceType] ?? journal.sourceType}
                  </TableCell>
                  <TableCell className="numeric tabular">{formatMoney(journal.total, currency)}</TableCell>
                  <TableCell>
                    <Badge variant={journal.status === 'POSTED' ? 'success' : 'secondary'}>
                      {journal.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            basePath="/journals"
            params={{ q: query.q }}
          />
        </Card>
      )}
    </>
  )
}
