'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const TABS = [
  { href: '/reports', label: 'All reports' },
  { href: '/reports/profit-loss', label: 'Profit & loss' },
  { href: '/reports/balance-sheet', label: 'Balance sheet' },
  { href: '/reports/cash-flow', label: 'Cash flow' },
  { href: '/reports/trial-balance', label: 'Trial balance' },
]

/**
 * The statements people move between constantly, carrying the current period
 * with them — switching report should not reset the dates you just chose.
 */
export function ReportsNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={query && tab.href !== '/reports' ? `${tab.href}?${query}` : tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
