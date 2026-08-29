import type { Metadata } from 'next'

import { PageHeader } from '@/components/data/page-header'
import { RankedTable } from '@/components/reports/ranked-table'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import { expensesByCategory } from '@/server/reports/business'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Expenses by category' }

export default async function ExpensesByCategoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)

  const report = await expensesByCategory(ctx.orgId, settings.range)

  return (
    <>
      <PageHeader
        title="Expenses by category"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · from the ledger, however it was entered`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', exportAs: 'expenses-by-category' }}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <RankedTable
            rows={report.rows}
            total={report.total}
            currency={ctx.organization.baseCurrency}
            nameHeader="Account"
            countHeader="Entries"
            linkTo={(id) => `/accounts/${id}?from=${settings.range.from}&to=${settings.range.to}`}
            empty="No expenses were recorded in this period."
          />
        </div>
      </Card>
    </>
  )
}
