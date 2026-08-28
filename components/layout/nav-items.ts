import type { LucideIcon } from 'lucide-react'
import {
  BanknoteIcon,
  BookOpenIcon,
  BuildingIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptIcon,
  SettingsIcon,
  TrendingUpIcon,
  UsersIcon,
} from 'lucide-react'

import type { Permission } from '@/server/auth/permissions'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  permission?: Permission
  /** Phase that delivers this destination. Anything not yet built renders disabled. */
  phase: number
}

export type NavGroup = { label: string; items: NavItem[] }

/**
 * The full navigation is declared now and gated by phase, so the shape of the
 * product is visible from the first screen and each phase lights up its own
 * section rather than rearranging the sidebar.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboardIcon, phase: 1 }],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Chart of accounts', href: '/accounts', icon: BookOpenIcon, permission: 'account:read', phase: 2 },
      { label: 'Journal entries', href: '/journals', icon: FileTextIcon, permission: 'journal:read', phase: 2 },
      { label: 'Periods', href: '/periods', icon: BuildingIcon, permission: 'period:read', phase: 2 },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Customers', href: '/customers', icon: UsersIcon, permission: 'customer:read', phase: 3 },
      { label: 'Products & services', href: '/items', icon: PackageIcon, permission: 'item:read', phase: 3 },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIcon, permission: 'invoice:read', phase: 4 },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { label: 'Vendors', href: '/vendors', icon: UsersIcon, permission: 'vendor:read', phase: 3 },
      { label: 'Bills', href: '/bills', icon: ReceiptIcon, permission: 'bill:read', phase: 5 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Banking', href: '/banking', icon: BanknoteIcon, permission: 'bank:read', phase: 6 },
      { label: 'Reports', href: '/reports', icon: TrendingUpIcon, permission: 'report:read', phase: 2 },
    ],
  },
  {
    label: 'Manage',
    items: [{ label: 'Settings', href: '/settings/organization', icon: SettingsIcon, permission: 'org:read', phase: 1 }],
  },
]

/** Phases delivered so far. Bumped as each phase completes. */
export const DELIVERED_PHASE = 3
