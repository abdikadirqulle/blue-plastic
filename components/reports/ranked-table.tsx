import Link from 'next/link'

import { EmptyState } from '@/components/data/empty-state'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Decimal, formatMoney } from '@/lib/money'
import type { RankedRow } from '@/server/reports/business'

/**
 * A "who and how much" report: rows ordered by size, each with its share of the
 * total and a bar to make the shape readable at a glance. Ordering by amount
 * rather than by name is the point — the question is always which few names
 * account for most of the number.
 */
export function RankedTable({
  rows,
  total,
  currency,
  nameHeader,
  countHeader,
  linkTo,
  quantities,
  empty,
}: {
  rows: (RankedRow & { quantity?: Decimal })[]
  total: Decimal
  currency: string
  nameHeader: string
  countHeader: string
  linkTo?: (id: string) => string
  quantities?: boolean
  empty: string
}) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing to report" description={empty} />
  }

  const largest = rows.reduce((max, row) => (row.amount.abs().greaterThan(max) ? row.amount.abs() : max), new Decimal(0))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{nameHeader}</TableHead>
          <TableHead className="numeric w-24">{countHeader}</TableHead>
          {quantities ? <TableHead className="numeric w-28">Quantity</TableHead> : null}
          <TableHead className="numeric w-40">Amount</TableHead>
          <TableHead className="w-48">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              {linkTo ? (
                <Link href={linkTo(row.id)} className="underline-offset-4 hover:underline">
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
            </TableCell>
            <TableCell className="numeric tabular text-muted-foreground">{row.count}</TableCell>
            {quantities ? (
              <TableCell className="numeric tabular text-muted-foreground">
                {row.quantity?.toDecimalPlaces(2).toString() ?? '—'}
              </TableCell>
            ) : null}
            <TableCell className="numeric tabular">{formatMoney(row.amount, currency)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: largest.isZero()
                        ? '0%'
                        : `${row.amount.abs().dividedBy(largest).times(100).toNumber().toFixed(1)}%`,
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular text-muted-foreground">
                  {row.share.toFixed(1)}%
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell />
          {quantities ? <TableCell /> : null}
          <TableCell className="numeric tabular font-semibold">{formatMoney(total, currency)}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  )
}
