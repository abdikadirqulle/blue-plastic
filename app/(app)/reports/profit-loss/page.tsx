import type { Metadata } from 'next'

import { PageHeader } from '@/components/data/page-header'
import { StatementTable } from '@/components/reports/statement-table'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import { profitAndLoss } from '@/server/reports/statements'
import { ReportControls } from '../report-controls'
import { COMPARISON_LABELS, readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Profit & loss' }

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)
  const currency = ctx.organization.baseCurrency

  const report = await profitAndLoss(ctx.orgId, { ...settings.range, basis: settings.basis }, {
    comparison: settings.comparisonRange,
  })

  const drill = (accountId: string) =>
    `/reports/transaction-detail?account=${accountId}&period=custom&from=${settings.range.from}&to=${settings.range.to}&back=/reports/profit-loss`

  return (
    <>
      <PageHeader
        title="Profit & loss"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · ${
          settings.basis === 'cash' ? 'cash basis' : 'accrual basis'
        }`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', basis: true, comparison: true, exportAs: 'profit-loss' }}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <StatementTable
            sections={report.sections}
            currency={currency}
            drillTo={drill}
            showPercent
            comparisonLabel={
              settings.comparison === 'none' ? undefined : COMPARISON_LABELS[settings.comparison]
            }
            subtotals={{
              cogs: [{ label: 'Gross profit', amount: report.grossProfit }],
              expenses: [{ label: 'Operating profit', amount: report.operatingProfit }],
              otherExpense: [{ label: 'Net income', amount: report.netIncome, emphasis: true }],
            }}
          />
        </div>

        <div className="border-t px-3 py-2.5 text-sm text-muted-foreground">
          {report.totalIncome.isZero() ? (
            'No income was recorded in this period.'
          ) : (
            <>
              Net income is{' '}
              <strong className="tabular text-foreground">{formatMoney(report.netIncome, currency)}</strong> on income
              of <span className="tabular">{formatMoney(report.totalIncome, currency)}</span> — a margin of{' '}
              <span className="tabular">
                {report.netIncome.dividedBy(report.totalIncome).times(100).toFixed(1)}%
              </span>
              .
            </>
          )}
        </div>
      </Card>
    </>
  )
}
