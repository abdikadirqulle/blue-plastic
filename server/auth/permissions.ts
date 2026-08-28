import type { Role } from '@prisma/client'

/**
 * Authorisation is permission-based at the call site and role-based only here.
 * Code asks for `journal:post`, never `role === 'ADMIN'` — so adding a role, or
 * moving a capability between roles, is a change to this file alone.
 *
 * The full matrix is defined now, including permissions for phases that do not
 * exist yet. Later phases add call sites; they do not redesign authorisation.
 */
export const PERMISSIONS = [
  // Organisation and people
  'org:read', 'org:update',
  'user:read', 'user:invite', 'user:update', 'user:remove',
  'audit:read',

  // Chart of accounts and the ledger            (Phase 2)
  'account:read', 'account:create', 'account:update', 'account:archive',
  'journal:read', 'journal:create', 'journal:post', 'journal:reverse',
  'period:read', 'period:close', 'period:reopen',

  // Master data                                  (Phase 3)
  'customer:read', 'customer:create', 'customer:update', 'customer:archive',
  'vendor:read', 'vendor:create', 'vendor:update', 'vendor:archive',
  'item:read', 'item:create', 'item:update', 'item:archive',
  'tax:read', 'tax:manage',

  // Sales                                        (Phase 4)
  'invoice:read', 'invoice:create', 'invoice:update', 'invoice:void', 'invoice:send',
  'payment:read', 'payment:create', 'payment:update', 'payment:void',

  // Purchases                                    (Phase 5)
  'bill:read', 'bill:create', 'bill:update', 'bill:void',
  'expense:read', 'expense:create', 'expense:update', 'expense:void',

  // Banking                                      (Phase 6)
  'bank:read', 'bank:transact', 'bank:reconcile', 'bank:import',

  // Inventory                                    (Phase 7)
  'inventory:read', 'inventory:adjust',

  // Reporting                                    (Phase 8)
  'report:read', 'report:export',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL = PERMISSIONS

const READ_ONLY = ALL.filter((p) => p.endsWith(':read')) as Permission[]

/**
 * SALES can raise invoices and take payments but cannot touch the chart of
 * accounts, post journals, reconcile a bank account or close a period. That
 * separation is the whole point of having roles in an accounting system.
 */
const SALES: Permission[] = [
  ...READ_ONLY.filter((p) => !p.startsWith('audit') && !p.startsWith('journal') && !p.startsWith('bank')),
  'customer:create', 'customer:update',
  'item:read',
  'invoice:create', 'invoice:update', 'invoice:send',
  'payment:create',
  'report:read',
]

/** BOOKKEEPER enters day-to-day transactions but cannot close periods or manage users. */
const BOOKKEEPER: Permission[] = [
  ...READ_ONLY,
  'customer:create', 'customer:update', 'customer:archive',
  'vendor:create', 'vendor:update', 'vendor:archive',
  'item:create', 'item:update', 'item:archive',
  'invoice:create', 'invoice:update', 'invoice:void', 'invoice:send',
  'payment:create', 'payment:update', 'payment:void',
  'bill:create', 'bill:update', 'bill:void',
  'expense:create', 'expense:update', 'expense:void',
  'bank:transact', 'bank:import',
  'journal:create',
  'report:read', 'report:export',
]

/** ACCOUNTANT adds the ledger-level authority: posting, reversing, closing. */
const ACCOUNTANT: Permission[] = [
  ...BOOKKEEPER,
  'account:create', 'account:update', 'account:archive',
  'journal:post', 'journal:reverse',
  'period:close', 'period:reopen',
  'tax:manage',
  'bank:reconcile',
  'inventory:adjust',
  'audit:read',
]

const ADMIN: Permission[] = [
  ...ACCOUNTANT,
  'org:update',
  'user:invite', 'user:update', 'user:remove',
]

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL),
  ADMIN: new Set(ADMIN),
  ACCOUNTANT: new Set(ACCOUNTANT),
  BOOKKEEPER: new Set(BOOKKEEPER),
  SALES: new Set(SALES),
  VIEWER: new Set(READ_ONLY),
}

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.VIEWER
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).has(permission)
}
