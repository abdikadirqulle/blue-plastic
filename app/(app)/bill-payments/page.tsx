import type { Metadata } from 'next'
import Link from 'next/link'
import { BanknoteIcon, PlusIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { PAYMENT_METHOD_LABELS, STATUS_LABELS, STATUS_VARIANTS } from '@/lib/sales-types'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as billPaymentService from '@/server/services/bill-payment.service'

export const metadata: Metadata = { title: 'Bill payments' }

export default async function BillPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('expense:read')
  const query = parseListQuery(await searchParams)
  const page = await billPaymentService.list(ctx, query)
  const currency = ctx.organization.baseCurrency

  const newButton = ctx.permissions.has('expense:create') ? (
    <Link href="/bill-payments/new" className={buttonVariants({ size: 'sm' })}>
      <PlusIcon /> Pay bills
    </Link>
  ) : undefined

  return (
    <>
      <PageHeader
        title="Bill payments"
        description="Money paid to vendors. One payment can settle several bills."
        actions={newButton}
      />

      <div className="mb-4">
        <SearchInput placeholder="Search number, reference or vendor" />
      </div>

      {page.total === 0 ? (
        <EmptyState
          icon={BanknoteIcon}
          title={query.q ? 'No payments match that search' : 'No bill payments yet'}
          description={query.q ? 'Try a different search.' : 'Settle what the business owes.'}
          action={!query.q ? newButton : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Number</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="numeric w-28">Amount</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="tabular font-medium">{payment.number}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                    {formatDate(toCalendarDate(payment.date))}
                  </TableCell>
                  <TableCell>{payment.vendor.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {payment.paymentAccount.code} {payment.paymentAccount.name}
                  </TableCell>
                  <TableCell className="numeric tabular">{formatMoney(payment.amount, currency)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[payment.status] ?? 'secondary'}>
                      {STATUS_LABELS[payment.status] ?? payment.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            pageSize={page.pageSize}
            basePath="/bill-payments"
            params={{ q: query.q }}
          />
        </Card>
      )}
    </>
  )
}
