import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Decimal, formatMoney } from '@/lib/money'
import type { StatementSection } from '@/server/reports/statements'

export type StatementColumn = { label: string; comparison?: boolean }

/**
 * The rendering shared by the profit and loss and the balance sheet: sections of
 * accounts, each with a total, and a running set of subtotal lines between them.
 *
 * A server component. There is nothing interactive on a statement except the
 * drill-down links, and shipping the figures as HTML rather than as JSON plus a
 * renderer is what makes these pages open instantly.
 */
export function StatementTable({
  sections,
  currency,
  drillTo,
  showPercent,
  comparisonLabel,
  subtotals = {},
}: {
  sections: StatementSection[]
  currency: string
  /** Builds the account link; omitted where a drill-down has no meaning. */
  drillTo?: (accountId: string) => string
  showPercent?: boolean
  comparisonLabel?: string
  /** Rendered after the section with the matching key. */
  subtotals?: Record<string, { label: string; amount: Decimal; emphasis?: boolean }[]>
}) {
  const columns = 2 + (showPercent ? 1 : 0) + (comparisonLabel ? 1 : 0)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="numeric w-40">Amount</TableHead>
          {comparisonLabel ? <TableHead className="numeric w-40">{comparisonLabel}</TableHead> : null}
          {showPercent ? <TableHead className="numeric w-24">% of income</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((section) => (
          <SectionRows
            key={section.key}
            section={section}
            currency={currency}
            drillTo={drillTo}
            showPercent={showPercent}
            hasComparison={Boolean(comparisonLabel)}
            columns={columns}
            subtotals={subtotals[section.key] ?? []}
          />
        ))}
      </TableBody>
    </Table>
  )
}

function SectionRows({
  section,
  currency,
  drillTo,
  showPercent,
  hasComparison,
  columns,
  subtotals,
}: {
  section: StatementSection
  currency: string
  drillTo?: (accountId: string) => string
  showPercent?: boolean
  hasComparison: boolean
  columns: number
  subtotals: { label: string; amount: Decimal; emphasis?: boolean }[]
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={columns} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section.label}
        </TableCell>
      </TableRow>

      {section.rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={columns} className="py-3 pl-6 text-sm text-muted-foreground">
            Nothing in this section.
          </TableCell>
        </TableRow>
      ) : (
        section.rows.map((row) => (
          <TableRow key={row.accountId}>
            <TableCell className="pl-6">
              {drillTo ? (
                <Link href={drillTo(row.accountId)} className="underline-offset-4 hover:underline">
                  <span className="tabular text-muted-foreground">{row.code}</span> {row.name}
                </Link>
              ) : (
                <>
                  <span className="tabular text-muted-foreground">{row.code}</span> {row.name}
                </>
              )}
            </TableCell>
            <TableCell className="numeric tabular">{formatMoney(row.amount, currency)}</TableCell>
            {hasComparison ? (
              <TableCell className="numeric tabular text-muted-foreground">
                {formatMoney(row.comparison ?? new Decimal(0), currency)}
              </TableCell>
            ) : null}
            {showPercent ? (
              <TableCell className="numeric tabular text-muted-foreground">
                {row.percentOfIncome ? `${row.percentOfIncome.toFixed(1)}%` : '—'}
              </TableCell>
            ) : null}
          </TableRow>
        ))
      )}

      <TableRow className="border-t">
        <TableCell className="pl-6 font-medium">Total {section.label.toLowerCase()}</TableCell>
        <TableCell className="numeric tabular font-medium">{formatMoney(section.total, currency)}</TableCell>
        {hasComparison ? (
          <TableCell className="numeric tabular font-medium text-muted-foreground">
            {formatMoney(section.comparisonTotal ?? new Decimal(0), currency)}
          </TableCell>
        ) : null}
        {showPercent ? <TableCell /> : null}
      </TableRow>

      {subtotals.map((subtotal) => (
        <TableRow key={subtotal.label} className={subtotal.emphasis ? 'bg-muted/60 hover:bg-muted/60' : ''}>
          <TableCell className={subtotal.emphasis ? 'font-semibold' : 'font-medium'}>{subtotal.label}</TableCell>
          <TableCell className={`numeric tabular ${subtotal.emphasis ? 'font-semibold' : 'font-medium'}`}>
            {formatMoney(subtotal.amount, currency)}
          </TableCell>
          {hasComparison ? <TableCell /> : null}
          {showPercent ? <TableCell /> : null}
        </TableRow>
      ))}
    </>
  )
}
