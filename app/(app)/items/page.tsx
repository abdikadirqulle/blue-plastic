import type { Metadata } from 'next'
import Link from 'next/link'
import { PackageIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { TableToolbar } from '@/components/data/table-toolbar'
import { NewItemButton } from '@/components/master-data/item-dialog'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { readSort } from '@/components/data/sortable-header'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import * as itemService from '@/server/services/item.service'
import * as taxService from '@/server/services/tax.service'
import { ItemTable } from './item-table'

const SORTABLE = ['name', 'type', 'price', 'cost', 'sku'] as const

export const metadata: Metadata = { title: 'Products and services' }

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'SERVICE', label: 'Services' },
  { value: 'NON_INVENTORY', label: 'Non-inventory' },
  { value: 'INVENTORY', label: 'Inventory' },
]

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('item:read')
  const params = await searchParams
  const query = parseListQuery(params)
  const type = typeof params.type === 'string' ? params.type : undefined
  const includeInactive = params.archived === '1'
  const sort = readSort(params, SORTABLE, { sort: 'name', dir: 'asc' })
  const linkParams = {
    q: query.q,
    type,
    archived: includeInactive ? '1' : undefined,
    sort: sort.sort,
    dir: sort.dir,
  }

  const [page, accounts, taxCodes, categories] = await Promise.all([
    itemService.list(ctx, query, { type, includeInactive, ...sort }),
    accountService.postableAccounts(ctx),
    taxService.listCodes(ctx),
    itemService.listCategories(ctx),
  ])

  const canCreate = ctx.permissions.has('item:create')
  const accountOptions = accounts.map((account) => ({
    id: account.id,
    label: `${account.code} ${account.name}`,
    type: account.type,
    subtype: account.subtype,
  }))
  const taxOptions = taxCodes.filter((c) => c.isActive).map((c) => ({ id: c.id, label: c.name }))
  const categoryOptions = categories.map((c) => ({ id: c.id, label: c.name }))

  const newButton = canCreate ? (
    <NewItemButton
      accounts={accountOptions}
      taxCodes={taxOptions}
      categories={categoryOptions}
      currency={ctx.organization.baseCurrency}
    />
  ) : undefined

  return (
    <>
      <PageHeader
        title="Products and services"
        description="What the business sells. Each item carries the accounts it posts to, so an invoice is categorised by the item rather than by whoever is typing."
        actions={newButton}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search name, SKU or description" />
        <div className="flex gap-1">
          {TYPE_FILTERS.map((filter) => {
            const active = (type ?? '') === filter.value
            const href = filter.value ? `/items?type=${filter.value}` : '/items'
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
        <Link
          href={includeInactive ? '/items' : '/items?archived=1'}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {includeInactive ? 'Hide archived' : 'Show archived'}
        </Link>
        <div className="ml-auto">
          <TableToolbar exportHref={`/api/exports/items?${new URLSearchParams(
            Object.entries(linkParams).filter((entry): entry is [string, string] => Boolean(entry[1])),
          ).toString()}`} />
        </div>
      </div>

      {page.total === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title={query.q || type ? 'No items match' : 'No products or services yet'}
          description={
            query.q || type
              ? 'Try a different search or filter.'
              : 'Add what the business sells. An inventory item also needs a stock account and a cost of goods sold account, so selling one moves both in the same journal as the sale.'
          }
          action={!query.q && !type ? newButton : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ItemTable
            sort={sort}
            linkParams={linkParams}
            rows={page.rows}
            accounts={accountOptions}
            taxCodes={taxOptions}
            categories={categoryOptions}
            currency={ctx.organization.baseCurrency}
            canEdit={ctx.permissions.has('item:update')}
            canArchive={ctx.permissions.has('item:archive')}
          />
          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            pageSize={page.pageSize}
            basePath="/items"
            params={linkParams}
          />
        </Card>
      )}
    </>
  )
}
