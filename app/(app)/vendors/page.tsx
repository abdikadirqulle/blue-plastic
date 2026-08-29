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
import * as accountService from '@/server/services/account.service'
import * as contactService from '@/server/services/contact.service'
import * as taxService from '@/server/services/tax.service'
import { IMPORT_COLUMNS } from '@/server/services/import.service'

const SORTABLE = ['name', 'email', 'phone', 'company'] as const

export const metadata: Metadata = { title: 'Vendors' }

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('vendor:read')
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


  const [page, terms, accounts] = await Promise.all([
    contactService.listVendors(ctx, query, { includeInactive, ...sort }),
    taxService.listPaymentTerms(ctx),
    accountService.postableAccounts(ctx),
  ])

  const canCreate = ctx.permissions.has('vendor:create')
  const termOptions = terms.map((term) => ({ id: term.id, label: `${term.name} — ${describeTerm(term)}` }))
  const expenseOptions = accounts
    .filter((account) => account.type === 'EXPENSE' || account.type === 'ASSET')
    .map((account) => ({ id: account.id, label: `${account.code} ${account.name}` }))

  const newButton = canCreate ? (
    <NewContactButton
      side="vendor"
      terms={termOptions}
      expenseAccounts={expenseOptions}
      today={today(ctx.organization.timeZone)}
      currency={ctx.organization.baseCurrency}
    />
  ) : undefined

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Who the business owes. Balances come straight from the ledger — the same rows the payables control account is built from."
        actions={
          <>
            {canCreate ? <ImportDialog side="vendor" columns={IMPORT_COLUMNS} /> : null}
            {newButton}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search name, company, email or phone" />
        <Link
          href={includeInactive ? '/vendors' : '/vendors?archived=1'}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {includeInactive ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>

      {page.total === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={query.q ? 'No vendors match that search' : 'No vendors yet'}
          description={
            query.q
              ? 'Try a different name, company, email or phone number.'
              : 'Add the suppliers you buy from. If you already have a list, import it.'
          }
          action={!query.q ? newButton : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ContactTable
            sort={sort}
            basePath="/vendors"
            linkParams={linkParams}
            side="vendor"
            rows={page.rows.map((row) => ({
              ...row,
              companyName: row.companyName ?? null,
              creditLimit: null,
            }))}
            terms={termOptions}
            expenseAccounts={expenseOptions}
            currency={ctx.organization.baseCurrency}
            today={today(ctx.organization.timeZone)}
            canEdit={ctx.permissions.has('vendor:update')}
            canArchive={ctx.permissions.has('vendor:archive')}
          />
          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            pageSize={page.pageSize}
            basePath="/vendors"
            params={linkParams}
          />
        </Card>
      )}
    </>
  )
}
