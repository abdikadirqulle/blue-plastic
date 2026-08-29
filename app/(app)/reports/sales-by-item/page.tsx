import type { Metadata } from 'next'

import { PageHeader } from '@/components/data/page-header'
import { RankedTable } from '@/components/reports/ranked-table'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import { salesByItem } from '@/server/reports/business'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Sales by item' }

export default async function SalesByItemPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)

  const report = await salesByItem(ctx.orgId, settings.range)

  return (
    <>
      <PageHeader
        title="Sales by product or service"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · net of tax`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', exportAs: 'sales-by-item' }}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <RankedTable
            rows={report.rows}
            total={report.total}
            currency={ctx.organization.baseCurrency}
            nameHeader="Item"
            countHeader="Documents"
            quantities
            empty="Nothing was sold in this period."
          />
        </div>
      </Card>
    </>
  )
}
