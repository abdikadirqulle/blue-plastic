import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileTextIcon, PlusIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { RowActions } from '@/components/data/row-actions'
import { SearchInput } from '@/components/data/search-input'
import { TableToolbar } from '@/components/data/table-toolbar'
import { readSort, SortableHeader } from '@/components/data/sortable-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, toCalendarDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { bySlug, STATUS_LABELS, STATUS_VARIANTS } from '@/lib/sales-types'
import { cn } from '@/lib/utils'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as salesService from '@/server/services/sales.service'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const config = bySlug((await params).type)
  return { title: config?.plural ?? 'Sales' }
}

const SORTABLE = ['number', 'date', 'customer', 'dueDate', 'total', 'status'] as const

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'draft', label: 'Drafts' },
]

export default async function SalesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const config = bySlug((await params).type)
  if (!config) notFound()

  const ctx = await requireOrgContext('invoice:read')
  const search = await searchParams
  const query = parseListQuery(search)
  const status = typeof search.status === 'string' ? search.status : undefined
  const sort = readSort(search, SORTABLE, { sort: 'date', dir: 'desc' })

  const page = await salesService.list(ctx, config.type, query, { status, ...sort })
  const currency = ctx.organization.baseCurrency
  const now = today(ctx.organization.timeZone)

  const basePath = `/sales/${config.slug}`
  const linkParams = { q: query.q, status, sort: sort.sort, dir: sort.dir }

  const canCreate = ctx.permissions.has(config.createPermission)
  const canEditDocuments = ctx.permissions.has('invoice:update')
  const newButton = canCreate ? (
    <Link href={`/sales/${config.slug}/new`} className={buttonVariants({ size: 'sm' })}>
      <PlusIcon /> New {config.singular.toLowerCase()}
    </Link>
  ) : undefined

  return (
    <>
      <PageHeader title={config.plural} description={config.effect} actions={newButton} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search number, reference or customer" />
        {config.type === 'INVOICE' ? (
          <div className="flex gap-1">
            {FILTERS.map((filter) => {
              const active = (status ?? '') === filter.value
              const href = filter.value
                ? `/sales/${config.slug}?status=${filter.value}`
                : `/sales/${config.slug}`
              return (
                <Link
                  key={filter.label}
                  href={href}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-sm transition-colors',
                    active ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {filter.label}
                </Link>
              )
            })}
          </div>
        ) : null}
        <TableToolbar exportHref={`/api/exports/${config.slug}?${new URLSearchParams(
          Object.entries(linkParams).filter((entry): entry is [string, string] => Boolean(entry[1])),
        ).toString()}`} />
      </div>

      {page.total === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title={query.q || status ? `No ${config.plural.toLowerCase()} match` : `No ${config.plural.toLowerCase()} yet`}
          description={query.q || status ? 'Try a different search or filter.' : config.effect}
          action={!query.q && !status ? newButton : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader column="number" label="Number" state={sort} basePath={basePath} params={linkParams} className="w-32" />
                <SortableHeader column="date" label="Date" state={sort} basePath={basePath} params={linkParams} className="w-28" defaultDirection="desc" />
                <SortableHeader column="customer" label="Customer" state={sort} basePath={basePath} params={linkParams} />
                {config.type === 'INVOICE' ? (
                  <SortableHeader column="dueDate" label="Due" state={sort} basePath={basePath} params={linkParams} className="w-28" />
                ) : null}
                <SortableHeader column="total" label="Total" state={sort} basePath={basePath} params={linkParams} className="w-32" numeric defaultDirection="desc" />
                {config.type === 'INVOICE' ? (
                  <TableHead className="numeric w-32">Outstanding</TableHead>
                ) : null}
                <SortableHeader column="status" label="Status" state={sort} basePath={basePath} params={linkParams} className="w-28" />
                <TableHead className="w-10 print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => {
                const overdue =
                  row.dueDate &&
                  toCalendarDate(row.dueDate) < now &&
                  (row.status === 'OPEN' || row.status === 'PARTIAL')

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/sales/${config.slug}/${row.id}`}
                        className="tabular font-medium underline-offset-4 hover:underline"
                      >
                        {row.number}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                      {formatDate(toCalendarDate(row.date))}
                    </TableCell>
                    <TableCell>{row.customer.displayName}</TableCell>
                    {config.type === 'INVOICE' ? (
                      <TableCell
                        className={cn(
                          'tabular whitespace-nowrap',
                          overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {row.dueDate ? formatDate(toCalendarDate(row.dueDate)) : '—'}
                      </TableCell>
                    ) : null}
                    <TableCell className="numeric tabular">{formatMoney(row.total, currency)}</TableCell>
                    {config.type === 'INVOICE' ? (
                      <TableCell className="numeric tabular font-medium">
                        {Number(row.balance) === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatMoney(row.balance, currency)
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[row.status] ?? 'secondary'}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="print:hidden">
                      <RowActions
                        actions={[
                          { label: 'Open', href: `${basePath}/${row.id}`, icon: 'open' as const },
                          ...(canEditDocuments && row.status !== 'VOID'
                            ? [{ label: 'Edit', href: `${basePath}/${row.id}/edit`, icon: 'edit' as const }]
                            : []),
                          { label: 'Print', href: `${basePath}/${row.id}/print`, icon: 'print' as const },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            pageSize={page.pageSize}
            basePath={`/sales/${config.slug}`}
            params={linkParams}
          />
        </Card>
      )}
    </>
  )
}
