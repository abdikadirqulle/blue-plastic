import type { Metadata } from 'next'

import { PageHeader } from '@/components/data/page-header'
import { RankedTable } from '@/components/reports/ranked-table'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import { purchasesByVendor } from '@/server/reports/business'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Purchases by vendor' }

export default async function PurchasesByVendorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)

  const report = await purchasesByVendor(ctx.orgId, settings.range)

  return (
    <>
      <PageHeader
        title="Purchases by vendor"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · net of tax`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', exportAs: 'purchases-by-vendor' }}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <RankedTable
            rows={report.rows}
            total={report.total}
            currency={ctx.organization.baseCurrency}
            nameHeader="Vendor"
            countHeader="Documents"
            linkTo={(id) => `/vendors/${id}`}
            empty="Nothing was bought in this period."
          />
        </div>
      </Card>
    </>
  )
}
