import type { Metadata } from 'next'
import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/date'
import { formatMoney, type Money } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import { cashFlow, type CashFlowLine } from '@/server/reports/statements'
import { ReportControls } from '../report-controls'
import { readSettings, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Cash flow' }

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgContext('report:read')
  const query = await searchParams
  const settings = readSettings(query, ctx.organization)
  const currency = ctx.organization.baseCurrency

  const report = await cashFlow(ctx.orgId, settings.range)

  return (
    <>
      <PageHeader
        title="Statement of cash flows"
        description={`${formatDate(settings.range.from)} to ${formatDate(settings.range.to)} · indirect method`}
      />

      <ReportControls
        period={settings.period}
        from={settings.range.from}
        to={settings.range.to}
        asOf={settings.asOf}
        basis={settings.basis}
        comparison={settings.comparison}
        controls={{ mode: 'range', exportAs: 'cash-flow' }}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Movement</TableHead>
                <TableHead className="numeric w-44">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Section label="Operating activities" lines={report.operating.lines} currency={currency}>
                <Row label="Net income" amount={report.netIncome} currency={currency} indent />
              </Section>
              <Total label="Cash from operating activities" amount={report.operating.total} currency={currency} />

              <Section label="Investing activities" lines={report.investing.lines} currency={currency} />
              <Total label="Cash from investing activities" amount={report.investing.total} currency={currency} />

              <Section label="Financing activities" lines={report.financing.lines} currency={currency} />
              <Total label="Cash from financing activities" amount={report.financing.total} currency={currency} />

              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableCell className="font-semibold">Net change in cash</TableCell>
                <TableCell className="numeric tabular font-semibold">
                  {formatMoney(report.netChange, currency)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-6 text-muted-foreground">Cash at the start of the period</TableCell>
                <TableCell className="numeric tabular text-muted-foreground">
                  {formatMoney(report.openingCash, currency)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Cash at the end of the period</TableCell>
                <TableCell className="numeric tabular font-semibold">
                  {formatMoney(report.closingCash, currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div
          className={`flex items-center gap-2 border-t px-3 py-2.5 text-sm ${
            report.reconciles ? 'text-success' : 'text-destructive'
          }`}
        >
          {report.reconciles ? (
            <>
              <CheckCircle2Icon className="size-4 shrink-0" />
              <span>The statement explains the whole movement in the cash accounts.</span>
            </>
          ) : (
            <>
              <AlertTriangleIcon className="size-4 shrink-0" />
              <span>
                Unexplained movement of{' '}
                <strong className="tabular">{formatMoney(report.difference.abs(), currency)}</strong>. This should be
                impossible — report it before relying on any other figure.
              </span>
            </>
          )}
        </div>
      </Card>
    </>
  )
}

function Section({
  label,
  lines,
  currency,
  children,
}: {
  label: string
  lines: CashFlowLine[]
  currency: string
  children?: React.ReactNode
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={2} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </TableCell>
      </TableRow>
      {children}
      {lines.length === 0 && !children ? (
        <TableRow>
          <TableCell colSpan={2} className="py-3 pl-6 text-sm text-muted-foreground">
            No movement.
          </TableCell>
        </TableRow>
      ) : (
        lines.map((line) => <Row key={line.label} label={line.label} amount={line.amount} currency={currency} indent />)
      )}
    </>
  )
}

function Row({
  label,
  amount,
  currency,
  indent,
}: {
  label: string
  amount: Money
  currency: string
  indent?: boolean
}) {
  return (
    <TableRow>
      <TableCell className={indent ? 'pl-6' : ''}>{label}</TableCell>
      <TableCell className="numeric tabular">{formatMoney(amount, currency)}</TableCell>
    </TableRow>
  )
}

function Total({ label, amount, currency }: { label: string; amount: Money; currency: string }) {
  return (
    <TableRow className="border-t">
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="numeric tabular font-medium">{formatMoney(amount, currency)}</TableCell>
    </TableRow>
  )
}
