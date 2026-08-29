import type { LucideIcon } from 'lucide-react'
import {
  BanknoteIcon,
  BookOpenIcon,
  CircleHelpIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
} from 'lucide-react'

import type { Permission } from '@/server/auth/permissions'

export type NavTab = {
  label: string
  href: string
  permission?: Permission
  /** Extra path prefixes that should light this tab up. */
  also?: string[]
}

export type NavModule = {
  key: string
  label: string
  /** Where the sidebar entry goes. */
  href: string
  icon: LucideIcon
  permission?: Permission
  /** Path prefixes that belong to this module. */
  owns: string[]
  tabs?: NavTab[]
  /**
   * Carries the current query string across the module's tabs. The report
   * screens share a period and a basis; losing them on every tab click would
   * make the tabs worse than a link.
   */
  preserveQuery?: boolean
}

/**
 * Nine modules, and everything else is a tab inside one of them.
 *
 * The sidebar used to list twenty-two destinations under five headings, which is
 * a table of contents rather than a navigation. A person doing the books thinks
 * in terms of *sales* or *purchases*; which document they need is the second
 * question, and the second question belongs on the page, not in the chrome.
 */
export const MODULES: NavModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
    owns: ['/dashboard'],
  },
  {
    key: 'sales',
    label: 'Sales',
    href: '/sales/invoices',
    icon: ReceiptIcon,
    permission: 'invoice:read',
    owns: ['/sales', '/payments', '/customers', '/items'],
    tabs: [
      { label: 'Invoices', href: '/sales/invoices', permission: 'invoice:read' },
      { label: 'Estimates', href: '/sales/estimates', permission: 'invoice:read' },
      { label: 'Sales receipts', href: '/sales/sales-receipts', permission: 'invoice:read' },
      { label: 'Credit memos', href: '/sales/credit-memos', permission: 'invoice:read' },
      { label: 'Payments', href: '/payments', permission: 'payment:read' },
      { label: 'Customers', href: '/customers', permission: 'customer:read' },
      { label: 'Products & services', href: '/items', permission: 'item:read' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    href: '/purchases/bills',
    icon: ShoppingCartIcon,
    permission: 'bill:read',
    owns: ['/purchases', '/bill-payments', '/vendors'],
    tabs: [
      { label: 'Bills', href: '/purchases/bills', permission: 'bill:read' },
      { label: 'Expenses', href: '/purchases/expenses', permission: 'expense:read' },
      { label: 'Vendor credits', href: '/purchases/vendor-credits', permission: 'bill:read' },
      { label: 'Purchase orders', href: '/purchases/purchase-orders', permission: 'bill:read' },
      { label: 'Bill payments', href: '/bill-payments', permission: 'expense:read' },
      { label: 'Vendors', href: '/vendors', permission: 'vendor:read' },
    ],
  },
  {
    key: 'banking',
    label: 'Banking',
    href: '/banking',
    icon: BanknoteIcon,
    permission: 'bank:read',
    owns: ['/banking'],
    tabs: [
      { label: 'Accounts', href: '/banking', permission: 'bank:read' },
      { label: 'Transfers', href: '/banking/transfers', permission: 'bank:read' },
      { label: 'Deposits', href: '/banking/deposits', permission: 'bank:read' },
      { label: 'Import', href: '/banking/import', permission: 'bank:read' },
      { label: 'Reconcile', href: '/banking/reconcile', permission: 'bank:reconcile' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    href: '/inventory',
    icon: PackageIcon,
    permission: 'inventory:read',
    owns: ['/inventory'],
    tabs: [
      { label: 'Stock on hand', href: '/inventory', permission: 'inventory:read' },
      { label: 'Adjustments', href: '/inventory/adjustments', permission: 'inventory:adjust' },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    href: '/accounts',
    icon: BookOpenIcon,
    permission: 'account:read',
    owns: ['/accounts', '/journals', '/periods'],
    tabs: [
      { label: 'Chart of accounts', href: '/accounts', permission: 'account:read' },
      { label: 'Journal entries', href: '/journals', permission: 'journal:read' },
      { label: 'Periods & year-end', href: '/periods', permission: 'period:read' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/reports',
    icon: TrendingUpIcon,
    permission: 'report:read',
    owns: ['/reports'],
    preserveQuery: true,
    tabs: [
      { label: 'All reports', href: '/reports' },
      { label: 'Profit & loss', href: '/reports/profit-loss' },
      { label: 'Balance sheet', href: '/reports/balance-sheet' },
      { label: 'Cash flow', href: '/reports/cash-flow' },
      { label: 'Trial balance', href: '/reports/trial-balance' },
      { label: 'Adjusting entries', href: '/reports/adjusting-entries' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/settings/organization',
    icon: SettingsIcon,
    permission: 'org:read',
    owns: ['/settings'],
    tabs: [
      { label: 'Organisation', href: '/settings/organization' },
      { label: 'Payment terms', href: '/settings/payment-terms' },
      { label: 'Tax', href: '/settings/tax', permission: 'tax:read' },
      { label: 'Users', href: '/settings/users', permission: 'user:read' },
      { label: 'Your profile', href: '/settings/profile' },
      { label: 'Activity log', href: '/settings/activity', permission: 'audit:read' },
    ],
  },
  {
    key: 'help',
    label: 'Help',
    href: '/help',
    icon: CircleHelpIcon,
    owns: ['/help'],
    tabs: [
      { label: 'Guide', href: '/help' },
      { label: 'Keyboard shortcuts', href: '/help/shortcuts' },
      { label: 'How the ledger works', href: '/help/ledger' },
    ],
  },
]

/** The module a path belongs to, by longest matching prefix. */
export function moduleFor(pathname: string): NavModule | undefined {
  let best: { entry: NavModule; length: number } | undefined

  for (const entry of MODULES) {
    for (const prefix of entry.owns) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.length) best = { entry, length: prefix.length }
      }
    }
  }

  return best?.entry
}

/** The tab a path belongs to, by longest matching prefix. */
export function tabFor(section: NavModule, pathname: string): NavTab | undefined {
  let best: { tab: NavTab; length: number } | undefined

  for (const tab of section.tabs ?? []) {
    for (const prefix of [tab.href, ...(tab.also ?? [])]) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.length) best = { tab, length: prefix.length }
      }
    }
  }

  return best?.tab
}
