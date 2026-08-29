import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpenIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { SignedMoney } from '@/components/data/signed-money'
import { readSort, SortableHeader } from '@/components/data/sortable-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ACCOUNT_SUBTYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
} from '@/lib/accounting-labels'
import { today } from '@/lib/date'
import { Decimal } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import { AccountRowActions } from './account-row-actions'
import { NewAccountButton, type ParentOption } from './account-dialog'
import { InstallChartButton } from './install-chart-button'

export const metadata: Metadata = { title: 'Chart of accounts' }

const PAGE_SIZE = 25
const SORTABLE = ['code', 'name', 'type', 'subtype', 'balance'] as const

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('account:read')
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const showArchived = params.archived === '1'
  const sort = readSort(params, SORTABLE, { sort: 'code', dir: 'asc' })
  const page = Math.max(1, Number(params.page) || 1)

  const accounts = await accountService.list(ctx, { q, includeInactive: showArchived })

  const canCreate = ctx.permissions.has('account:create')
  const canEdit = ctx.permissions.has('account:update')
  const canArchive = ctx.permissions.has('account:archive')
  const currency = ctx.organization.baseCurrency

  const parents: ParentOption[] = accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
  }))

  if (accounts.length === 0 && !q && !showArchived) {
    return (
      <>
        <PageHeader
          title="Chart of accounts"
          description="Every account the business posts to, and the balance sitting in each."
        />
        <EmptyState
          icon={BookOpenIcon}
          title="No accounts yet"
          description="Start from a standard chart for a goods-trading business — assets, liabilities, equity, income, cost of sales and expenses, including the control accounts the system posts to. You can rename, renumber and extend everything afterwards."
          action={canCreate ? <InstallChartButton /> : undefined}
        />
      </>
    )
  }

  // The chart is ordered by statement type first — assets, liabilities, equity,
  // income, expenses — because that is the order an accountant reads it in, and
  // account numbers only sort correctly *within* a type.
  const typeRank = new Map(ACCOUNT_TYPE_ORDER.map((type, index) => [type, index]))
  const direction = sort.dir === 'asc' ? 1 : -1

  const sorted = [...accounts].sort((a, b) => {
    switch (sort.sort) {
      case 'name':
        return direction * a.name.localeCompare(b.name)
      case 'type':
        return (
          direction * ((typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99)) ||
          a.code.localeCompare(b.code)
        )
      case 'subtype':
        return (
          direction * ACCOUNT_SUBTYPE_LABELS[a.subtype].localeCompare(ACCOUNT_SUBTYPE_LABELS[b.subtype]) ||
          a.code.localeCompare(b.code)
        )
      case 'balance':
        return direction * new Decimal(a.balance).comparedTo(new Decimal(b.balance))
      default:
        return (
          direction *
          ((typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99) || a.code.localeCompare(b.code))
        )
    }
  })

  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  // Indentation shows the parent/child structure, which only reads correctly in
  // the chart's own order. Sorted by balance, a child three rows from its parent
  // indented under nothing would be misleading rather than helpful.
  const showHierarchy = sort.sort === 'code' && sort.dir === 'asc'

  const linkParams = {
    q,
    archived: showArchived ? '1' : undefined,
    sort: sort.sort,
    dir: sort.dir,
  }

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description={`Balances as at ${today(ctx.organization.timeZone)}, shown on each account's natural side.`}
        actions={
          canCreate ? (
            <NewAccountButton
              parents={parents}
              today={today(ctx.organization.timeZone)}
              currency={currency}
            />
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search by number or name" />
        <Link
          href={showArchived ? '/accounts' : '/accounts?archived=1'}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Link>
        <Link
          href="/settings/accounts"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Which account the system posts to
        </Link>
      </div>

      {total === 0 ? (
        <EmptyState icon={BookOpenIcon} title="No accounts match that search" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    column="code"
                    label="Number"
                    state={sort}
                    basePath="/accounts"
                    params={linkParams}
                    className="w-28"
                  />
                  <SortableHeader
                    column="name"
                    label="Name"
                    state={sort}
                    basePath="/accounts"
                    params={linkParams}
                  />
                  <SortableHeader
                    column="type"
                    label="Type"
                    state={sort}
                    basePath="/accounts"
                    params={linkParams}
                    className="w-36"
                  />
                  <SortableHeader
                    column="subtype"
                    label="Detail type"
                    state={sort}
                    basePath="/accounts"
                    params={linkParams}
                    className="w-48"
                  />
                  <SortableHeader
                    column="balance"
                    label="Balance"
                    state={sort}
                    basePath="/accounts"
                    params={linkParams}
                    className="w-40"
                    numeric
                    defaultDirection="desc"
                  />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((account) => (
                  <TableRow key={account.id} className={account.isActive ? undefined : 'opacity-55'}>
                    <TableCell className="tabular text-muted-foreground">{account.code}</TableCell>
                    <TableCell>
                      <span
                        className="flex items-center gap-2"
                        style={showHierarchy ? { paddingLeft: `${account.depth * 1.25}rem` } : undefined}
                      >
                        <Link
                          href={`/accounts/${account.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {account.name}
                        </Link>
                        {account.isSystem ? (
                          <Badge variant="secondary" title="Posted to by the system. Cannot be deleted.">
                            system
                          </Badge>
                        ) : null}
                        {account.hasChildren ? (
                          <Badge variant="outline" title="A grouping heading; postings go to its sub-accounts.">
                            heading
                          </Badge>
                        ) : null}
                        {!account.isActive ? <Badge variant="outline">archived</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[account.type]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ACCOUNT_SUBTYPE_LABELS[account.subtype]}
                    </TableCell>
                    <TableCell className="numeric">
                      {account.hasChildren ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <SignedMoney amount={account.balance} currency={currency} />
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit || canArchive ? (
                        <AccountRowActions
                          account={{
                            id: account.id,
                            code: account.code,
                            name: account.name,
                            description: account.description,
                            type: account.type,
                            parentId: account.parentId,
                            isSystem: account.isSystem,
                            isActive: account.isActive,
                          }}
                          parents={parents}
                          canEdit={canEdit}
                          canArchive={canArchive}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={current}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            basePath="/accounts"
            params={linkParams}
          />
        </Card>
      )}
    </>
  )
}
