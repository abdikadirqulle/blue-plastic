import type { Metadata } from 'next'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import { taxSummary } from '@/server/reports/business'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Tax summary' }

export default async function TaxSummaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization, 'this-quarter')
  const currency = ctx.organization.baseCurrency

  const report = await taxSummary(ctx.orgId, settings.range)

  return (
    <>
      <PageHeader
        title="Tax summary"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · what is owed to each agency`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', exportAs: 'tax-summary' }}
      />

      {report.rows.length === 0 ? (
        <EmptyState
          title="No taxable activity"
          description="Nothing in this period carried a tax code. Tax codes are set up under Settings → Tax."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead className="numeric w-20">Rate</TableHead>
                  <TableHead className="numeric w-36">Taxable sales</TableHead>
                  <TableHead className="numeric w-36">Tax on sales</TableHead>
                  <TableHead className="numeric w-36">Taxable purchases</TableHead>
                  <TableHead className="numeric w-36">Tax on purchases</TableHead>
                  <TableHead className="numeric w-36">Net owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.rateId}>
                    <TableCell className="font-medium">{row.rateName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.agencyName}</TableCell>
                    <TableCell className="numeric tabular text-muted-foreground">
                      {row.ratePercent.toDecimalPlaces(3).toString()}%
                    </TableCell>
                    <TableCell className="numeric tabular">{formatMoney(row.salesNet, currency)}</TableCell>
                    <TableCell className="numeric tabular">{formatMoney(row.salesTax, currency)}</TableCell>
                    <TableCell className="numeric tabular">{formatMoney(row.purchaseNet, currency)}</TableCell>
                    <TableCell className="numeric tabular">{formatMoney(row.purchaseTax, currency)}</TableCell>
                    <TableCell className="numeric tabular font-medium">{formatMoney(row.net, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} className="font-semibold">
                    Net owed to tax agencies
                  </TableCell>
                  <TableCell className="numeric tabular font-semibold">
                    {formatMoney(report.totalNet, currency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <p className="border-t px-3 py-2.5 text-sm text-muted-foreground">
            Split rate by rate from the document lines, because a return is filed per rate and a single Sales Tax
            Payable balance cannot be separated again once several rates have been posted to it.
          </p>
        </Card>
      )}
    </>
  )
}
