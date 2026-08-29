import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BanknoteIcon,
  BookOpenIcon,
  ClockIcon,
  PackageIcon,
  PercentIcon,
  ReceiptIcon,
  ScaleIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Card } from '@/components/ui/card'
import { requireOrgContext } from '@/server/auth/context'

export const metadata: Metadata = { title: 'Reports' }

const GROUPS: {
  label: string
  reports: { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[]
}[] = [
  {
    label: 'Financial statements',
    reports: [
      {
        href: '/reports/profit-loss',
        title: 'Profit & loss',
        description: 'What was earned and what it cost, with gross and net profit stated separately.',
        icon: TrendingUpIcon,
      },
      {
        href: '/reports/balance-sheet',
        title: 'Balance sheet',
        description: 'What the business owns and owes at a date, with its own balance check.',
        icon: ScaleIcon,
      },
      {
        href: '/reports/cash-flow',
        title: 'Statement of cash flows',
        description: 'How profit turned into cash — or did not. Indirect method.',
        icon: WalletIcon,
      },
      {
        href: '/reports/trial-balance',
        title: 'Trial balance',
        description: 'Every account with a balance, proving debits equal credits.',
        icon: BookOpenIcon,
      },
    ],
  },
  {
    label: 'Who owes what',
    reports: [
      {
        href: '/reports/ar-aging',
        title: 'Accounts receivable ageing',
        description: 'Unpaid invoices by how overdue they are.',
        icon: ClockIcon,
      },
      {
        href: '/reports/ap-aging',
        title: 'Accounts payable ageing',
        description: 'Unpaid bills by how overdue they are.',
        icon: ClockIcon,
      },
    ],
  },
  {
    label: 'Trade',
    reports: [
      {
        href: '/reports/sales-by-customer',
        title: 'Sales by customer',
        description: 'Who buys, ranked by how much.',
        icon: UsersIcon,
      },
      {
        href: '/reports/sales-by-item',
        title: 'Sales by product or service',
        description: 'What sells, by value and quantity.',
        icon: PackageIcon,
      },
      {
        href: '/reports/purchases-by-vendor',
        title: 'Purchases by vendor',
        description: 'Where the buying goes.',
        icon: ReceiptIcon,
      },
      {
        href: '/reports/expenses-by-category',
        title: 'Expenses by category',
        description: 'Where the money goes, read from the ledger however it was entered.',
        icon: BanknoteIcon,
      },
    ],
  },
  {
    label: 'Tax',
    reports: [
      {
        href: '/reports/tax-summary',
        title: 'Tax summary',
        description: 'Tax collected and reclaimable, split rate by rate for filing.',
        icon: PercentIcon,
      },
    ],
  },
]

export default async function ReportsIndexPage() {
  await requireOrgContext('report:read')

  return (
    <>
      <PageHeader title="Reports" description="Every figure here is read from the ledger, not stored separately." />

      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.reports.map((report) => (
                <Link key={report.href} href={report.href} className="group">
                  <Card className="h-full p-4 transition-colors group-hover:border-primary/40 group-hover:bg-muted/40">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                        <report.icon className="size-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{report.title}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{report.description}</span>
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
