import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpenIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { SearchInput } from '@/components/data/search-input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ACCOUNT_SUBTYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  isDebitNormalType,
} from '@/lib/accounting-labels'
import { today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import { AccountRowActions } from './account-row-actions'
import { NewAccountButton, type ParentOption } from './account-dialog'
import { InstallChartButton } from './install-chart-button'

export const metadata: Metadata = { title: 'Chart of accounts' }

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('account:read')
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const showArchived = params.archived === '1'

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

  const grouped = ACCOUNT_TYPE_ORDER.map((type) => ({
    type,
    accounts: accounts.filter((account) => account.type === type),
  })).filter((group) => group.accounts.length > 0)

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
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon={BookOpenIcon} title="No accounts match that search" />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <Card key={group.type} className="overflow-hidden p-0">
              <div className="flex items-baseline justify-between border-b bg-muted/30 px-3 py-2">
                <h2 className="text-sm font-semibold">{ACCOUNT_TYPE_LABELS[group.type]}</h2>
                <span className="text-xs text-muted-foreground">
                  {isDebitNormalType(group.type) ? 'Debit balances' : 'Credit balances'}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Detail type</TableHead>
                    <TableHead className="numeric">Balance</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.accounts.map((account) => (
                    <TableRow key={account.id} className={account.isActive ? undefined : 'opacity-55'}>
                      <TableCell className="tabular text-muted-foreground">{account.code}</TableCell>
                      <TableCell>
                        <span
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${account.depth * 1.25}rem` }}
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
                        {ACCOUNT_SUBTYPE_LABELS[account.subtype]}
                      </TableCell>
                      <TableCell className="numeric tabular">
                        {account.hasChildren ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatMoney(account.balance, currency)
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
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
