import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftRightIcon, BanknoteIcon, UploadIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { StartReconciliationButton } from '@/components/banking/start-reconciliation'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, toCalendarDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as bankingService from '@/server/services/banking.service'
import { history } from '@/server/services/reconciliation.service'

export const metadata: Metadata = { title: 'Banking' }

export default async function BankingPage() {
  const ctx = await requireOrgContext('bank:read')
  const [accounts, reconciliations] = await Promise.all([
    bankingService.bankAccounts(ctx),
    history(ctx),
  ])

  const currency = ctx.organization.baseCurrency
  const canTransact = ctx.permissions.has('bank:transact')
  const canReconcile = ctx.permissions.has('bank:reconcile')

  return (
    <>
      <PageHeader
        title="Banking"
        description="Every account money passes through, what the books say it holds, and how much of that the bank has already confirmed."
        actions={
          <>
            {ctx.permissions.has('bank:import') ? (
              <Link href="/banking/import" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <UploadIcon /> Import statement
              </Link>
            ) : null}
            {canTransact ? (
              <>
                <Link href="/banking/deposits/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  <BanknoteIcon /> Make a deposit
                </Link>
                <Link href="/banking/transfers/new" className={buttonVariants({ size: 'sm' })}>
                  <ArrowLeftRightIcon /> Transfer
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={BanknoteIcon}
          title="No bank accounts yet"
          description="Add a bank or credit card account to the chart of accounts, and it will appear here."
        />
      ) : (
        <Card className="mb-6 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="numeric w-40">In the books</TableHead>
                <TableHead className="numeric w-40">Confirmed by the bank</TableHead>
                <TableHead className="numeric w-40">Not yet confirmed</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link
                      href={`/accounts/${account.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      <span className="tabular text-muted-foreground">{account.code}</span> {account.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {account.subtype === 'CREDIT_CARD'
                        ? 'Credit card'
                        : account.subtype === 'UNDEPOSITED_FUNDS'
                          ? 'Money in hand, not yet banked'
                          : 'Bank'}
                    </span>
                  </TableCell>
                  <TableCell className="numeric tabular font-medium">
                    {formatMoney(account.balance, currency)}
                  </TableCell>
                  <TableCell className="numeric tabular text-muted-foreground">
                    {formatMoney(account.cleared, currency)}
                  </TableCell>
                  <TableCell className="numeric tabular text-muted-foreground">
                    {account.uncleared.isZero() ? '—' : formatMoney(account.uncleared, currency)}
                  </TableCell>
                  <TableCell>
                    {canReconcile && account.subtype !== 'UNDEPOSITED_FUNDS' ? (
                      <StartReconciliationButton
                        accountId={account.id}
                        accountName={account.name}
                        today={today(ctx.organization.timeZone)}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold">Reconciliations</h2>

      {reconciliations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nothing reconciled yet. Reconciling proves the books and the bank agree about every item up
            to a date — and the difference, when there is one, is the size of what is missing.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-32">Statement date</TableHead>
                <TableHead className="numeric w-36">Closing balance</TableHead>
                <TableHead className="numeric w-24">Items</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.account.code} {row.account.name}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap">
                    {formatDate(toCalendarDate(row.statementDate))}
                  </TableCell>
                  <TableCell className="numeric tabular">
                    {formatMoney(row.statementEndingBalance, currency)}
                  </TableCell>
                  <TableCell className="numeric tabular">{row._count.entries}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'COMPLETED' ? 'success' : 'warning'}>
                      {row.status === 'COMPLETED' ? 'Reconciled' : 'In progress'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/banking/reconcile/${row.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      {row.status === 'COMPLETED' ? 'View' : 'Continue'}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
