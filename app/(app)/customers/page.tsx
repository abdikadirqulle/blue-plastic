import type { Metadata } from 'next'
import Link from 'next/link'
import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { ImportDialog } from '@/components/master-data/import-dialog'
import { NewContactButton } from '@/components/master-data/contact-dialog'
import { readSort } from '@/components/data/sortable-header'
import { ContactTable } from '@/components/master-data/contact-table'
import { Card } from '@/components/ui/card'
import { describeTerm } from '@/lib/payment-terms'
import { today } from '@/lib/date'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as contactService from '@/server/services/contact.service'
import * as taxService from '@/server/services/tax.service'
import { IMPORT_COLUMNS } from '@/server/services/import.service'

const SORTABLE = ['name', 'email', 'phone', 'company'] as const

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('customer:read')
  const params = await searchParams
  const query = parseListQuery(params)
  const sort = readSort(params, SORTABLE, { sort: 'name', dir: 'asc' })
  const includeInactive = params.archived === '1'
  const linkParams = {
    q: query.q,
    archived: includeInactive ? '1' : undefined,
    sort: sort.sort,
    dir: sort.dir,
  }


  const [page, terms] = await Promise.all([
    contactService.listCustomers(ctx, query, { includeInactive, ...sort }),
    taxService.listPaymentTerms(ctx),
  ])

  const canCreate = ctx.permissions.has('customer:create')
  const termOptions = terms.map((term) => ({ id: term.id, label: `${term.name} — ${describeTerm(term)}` }))

  const newButton = canCreate ? (
    <NewContactButton
      side="customer"
      terms={termOptions}
      today={today(ctx.organization.timeZone)}
      currency={ctx.organization.baseCurrency}
    />
  ) : undefined

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who owes the business money. Balances come straight from the ledger — the same rows the receivables control account is built from."
        actions={
          <>
            {canCreate ? <ImportDialog side="customer" columns={IMPORT_COLUMNS} /> : null}
            {newButton}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search name, company, email or phone" />
        <Link
          href={includeInactive ? '/customers' : '/customers?archived=1'}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {includeInactive ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>

      {page.total === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={query.q ? 'No customers match that search' : 'No customers yet'}
          description={
            query.q
              ? 'Try a different name, company, email or phone number.'
              : 'Add the people and businesses you invoice. If you already have a list, import it.'
          }
          action={!query.q ? newButton : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ContactTable
            sort={sort}
            basePath="/customers"
            linkParams={linkParams}
            side="customer"
            rows={page.rows.map((row) => ({ ...row, companyName: row.companyName ?? null }))}
            terms={termOptions}
            currency={ctx.organization.baseCurrency}
            today={today(ctx.organization.timeZone)}
            canEdit={ctx.permissions.has('customer:update')}
            canArchive={ctx.permissions.has('customer:archive')}
          />
          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            pageSize={page.pageSize}
            basePath="/customers"
            params={linkParams}
          />
        </Card>
      )}
    </>
  )
}
