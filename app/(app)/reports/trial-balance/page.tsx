import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ACCOUNT_TYPE_LABELS } from '@/lib/accounting-labels'
import { fiscalYearOf, fiscalYearRange, formatDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { trialBalance } from '@/server/accounting/balances'
import { requireOrgContext } from '@/server/auth/context'
import { DateRangeForm } from './date-range-form'

export const metadata: Metadata = { title: 'Trial balance' }

/**
 * The trial balance is the ledger's own self-check: if total debits do not equal
 * total credits, something is wrong at a level no other report will reveal.
 * It is therefore stated plainly at the bottom rather than left to be inferred.
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams

  const defaults = fiscalYearRange(
    fiscalYearOf(today(ctx.organization.timeZone), ctx.organization.fiscalYearStartMonth),
    ctx.organization.fiscalYearStartMonth,
  )
  const from = typeof query.from === 'string' ? query.from : defaults.start
  const to = typeof query.to === 'string' ? query.to : defaults.end

  const report = await trialBalance(ctx.orgId, { from, to })
  const currency = ctx.organization.baseCurrency

  return (
    <>
      <PageHeader
        title="Trial balance"
        description={`Every account with a balance or movement between ${formatDate(from)} and ${formatDate(to)}.`}
      />

      <div className="mb-4">
        <DateRangeForm from={from} to={to} />
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Number</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="numeric w-36">Debit</TableHead>
              <TableHead className="numeric w-36">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nothing has been posted in this period.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell className="tabular text-muted-foreground">{row.code}</TableCell>
                  <TableCell>
                    <Link
                      href={`/accounts/${row.accountId}?from=${from}&to=${to}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ACCOUNT_TYPE_LABELS[row.type]}</TableCell>
                  <TableCell className="numeric tabular">
                    {row.closingDebit.isZero() ? '' : formatMoney(row.closingDebit, currency)}
                  </TableCell>
                  <TableCell className="numeric tabular">
                    {row.closingCredit.isZero() ? '' : formatMoney(row.closingCredit, currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">
                Totals
              </TableCell>
              <TableCell className="numeric tabular font-semibold">
                {formatMoney(report.totalDebit, currency)}
              </TableCell>
              <TableCell className="numeric tabular font-semibold">
                {formatMoney(report.totalCredit, currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>

        <div
          className={`flex items-center gap-2 border-t px-3 py-2.5 text-sm ${
            report.balanced ? 'text-success' : 'text-destructive'
          }`}
        >
          {report.balanced ? (
            <>
              <CheckCircle2Icon className="size-4 shrink-0" />
              <span>Debits equal credits. The ledger is in balance.</span>
            </>
          ) : (
            <>
              <AlertTriangleIcon className="size-4 shrink-0" />
              <span>
                The ledger is out of balance by{' '}
                <strong className="tabular">
                  {formatMoney(report.totalDebit.minus(report.totalCredit).abs(), currency)}
                </strong>
                . This should be impossible — report it before relying on any other figure.
              </span>
            </>
          )}
        </div>
      </Card>
    </>
  )
}
