import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BanknoteIcon,
  BookOpenIcon,
  ClipboardListIcon,
  ClockIcon,
  FileTextIcon,
  PackageIcon,
  PercentIcon,
  ReceiptIcon,
  ScaleIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Card } from '@/components/ui/card'
import { requireOrgContext } from '@/server/auth/context'

export const metadata: Metadata = { title: 'Reports' }

type Entry = {
  href: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * Every report in the system, grouped the way somebody looks for one.
 *
 * The groups are questions, not modules: *is the business making money*, *who
 * owes us*, *what have we bought*. A person opening this page has a question,
 * not a report name — and the two are only the same once you already know the
 * answer.
 */
const GROUPS: { label: string; blurb: string; reports: Entry[] }[] = [
  {
    label: 'Financial statements',
    blurb: 'The three statements, and the working papers behind them.',
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
      {
        href: '/reports/transaction-detail',
        title: 'Transaction detail by account',
        description:
          'Every transaction that touched one account, with the document behind each. Where every figure on every report leads.',
        icon: ScrollTextIcon,
      },
      {
        href: '/reports/adjusting-entries',
        title: 'Adjusting entries',
        description: 'Accruals, depreciation and the year-end sweep, apart from the trading entries.',
        icon: SlidersHorizontalIcon,
      },
    ],
  },
  {
    label: 'Customers and receivables',
    blurb: 'Who owes the business money, and what they have been sent.',
    reports: [
      {
        href: '/reports/customer-balances',
        title: 'Customer balances',
        description: 'What every customer owes, and how much of it is overdue.',
        icon: UsersIcon,
      },
      {
        href: '/reports/ar-aging',
        title: 'Receivables ageing',
        description: 'Unpaid invoices by customer, bucketed by how overdue they are.',
        icon: ClockIcon,
      },
      {
        href: '/reports/open-invoices',
        title: 'Open invoices',
        description: 'Every unpaid invoice, oldest first, with what is still owed on it.',
        icon: FileTextIcon,
      },
      {
        href: '/reports/payments-received',
        title: 'Payments received',
        description: 'Money in from customers, and what each payment settled.',
        icon: BanknoteIcon,
      },
      {
        href: '/reports/statements/customer',
        title: 'Customer statement',
        description: 'One customer, one period, every movement and a running balance. Prints as paper.',
        icon: ScrollTextIcon,
      },
    ],
  },
  {
    label: 'Vendors and payables',
    blurb: 'What the business owes, and where the spending goes.',
    reports: [
      {
        href: '/reports/vendor-balances',
        title: 'Vendor balances',
        description: 'What is owed to each vendor, and how much of it is overdue.',
        icon: UsersIcon,
      },
      {
        href: '/reports/ap-aging',
        title: 'Payables ageing',
        description: 'Unpaid bills by vendor, bucketed by how overdue they are.',
        icon: ClockIcon,
      },
      {
        href: '/reports/unpaid-bills',
        title: 'Unpaid bills',
        description: 'Everything still owed, oldest first — the pay-day list.',
        icon: ClipboardListIcon,
      },
      {
        href: '/reports/payments-made',
        title: 'Payments made',
        description: 'Money out to vendors, and the account each payment left.',
        icon: BanknoteIcon,
      },
      {
        href: '/reports/statements/vendor',
        title: 'Vendor statement',
        description: 'One vendor, one period, every bill and payment with a running balance.',
        icon: ScrollTextIcon,
      },
    ],
  },
  {
    label: 'Sales',
    blurb: 'What sells, to whom, and at what margin.',
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
        href: '/reports/product-profitability',
        title: 'Product profitability',
        description: 'Income against cost of goods sold, item by item — the margin actually earned.',
        icon: TrendingUpIcon,
      },
    ],
  },
  {
    label: 'Purchases and expenses',
    blurb: 'Where the money goes.',
    reports: [
      {
        href: '/reports/purchases-by-vendor',
        title: 'Purchases by vendor',
        description: 'Where the buying goes.',
        icon: ReceiptIcon,
      },
      {
        href: '/reports/purchases-by-item',
        title: 'Purchases by product or service',
        description: 'What was bought, by quantity and value.',
        icon: PackageIcon,
      },
      {
        href: '/reports/expenses-by-category',
        title: 'Expenses by category',
        description: 'Read from the ledger however it was entered.',
        icon: BanknoteIcon,
      },
      {
        href: '/reports/expenses-by-vendor',
        title: 'Expenses by vendor',
        description: 'What was spent with each vendor, net of tax, credits deducted.',
        icon: ReceiptIcon,
      },
    ],
  },
  {
    label: 'Inventory',
    blurb: 'What is on the shelf, what it is worth, and what moved.',
    reports: [
      {
        href: '/reports/inventory-valuation',
        title: 'Stock valuation',
        description: 'What is on hand and what it is worth, item by item.',
        icon: PackageIcon,
      },
      {
        href: '/reports/inventory-movements',
        title: 'Stock movements',
        description: 'Every movement in the period, and what it did to the value.',
        icon: ClipboardListIcon,
      },
      {
        href: '/reports/inventory-reorder',
        title: 'Reorder list',
        description: 'Products at or below their reorder point.',
        icon: PackageIcon,
      },
    ],
  },
  {
    label: 'Accounting',
    blurb: 'The ledger itself, for anyone who needs to see the workings.',
    reports: [
      {
        href: '/reports/general-ledger',
        title: 'General ledger',
        description: 'Every posted line, account by account, with a running balance.',
        icon: BookOpenIcon,
      },
      {
        href: '/reports/journal-report',
        title: 'Journal report',
        description: 'Every entry with both sides, the document and the party.',
        icon: ScrollTextIcon,
      },
      {
        href: '/reports/account-balances',
        title: 'Account balances',
        description: 'Opening balance, movement and closing balance for every account.',
        icon: ScaleIcon,
      },
      {
        href: '/reports/statements/account',
        title: 'Account statement',
        description: 'One account, every line, a running balance. A register you can print.',
        icon: ScrollTextIcon,
      },
    ],
  },
  {
    label: 'Tax',
    blurb: 'What is owed to the tax authority, and what it is made of.',
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
      <PageHeader
        title="Reports"
        description="Every figure here is read from the ledger, not stored separately. Each report takes a period, drills through to the documents behind it, and exports as CSV."
      />

      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{group.blurb}</p>
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
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {report.description}
                        </span>
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
