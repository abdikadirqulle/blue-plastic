import Link from 'next/link'

import { MONTHS } from '@/lib/constants'
import type { OrgContext } from '@/server/auth/context'
import { ROLE_LABELS } from '@/lib/roles'
import { CommandPalette } from './command-palette'
import { MobileNav } from './mobile-nav'
import { MODULES } from './nav-items'
import { NavigationProgress } from './navigation-progress'
import { QuickCreate } from './quick-create'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'

/**
 * A Server Component. Permission filtering happens here, once, and the client
 * navigation receives only what this user may see — a hidden link is a
 * convenience, but the list it is hidden from is computed on the server.
 *
 * The sidebar is its own scroll region pinned to the viewport, not a column that
 * scrolls away with the page. On a long report the navigation has to still be
 * there when you reach the bottom.
 */
export function AppShell({ ctx, children }: { ctx: OrgContext; children: React.ReactNode }) {
  const modules = MODULES.filter((entry) => !entry.permission || ctx.permissions.has(entry.permission))
  const moduleKeys = modules.map((entry) => entry.key)
  const permissions = [...ctx.permissions]

  return (
    <div className="flex min-h-svh">
      <NavigationProgress />

      {/*
        A white rail beside a soft-grey page. The organisation's name sits in a
        coloured block at the top, which is the one place the accent is allowed
        to be large — it says whose books these are, and on a system where one
        person may keep several sets, that is worth a glance rather than a click.
      */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-primary text-[0.625rem] font-bold text-primary-foreground">
              BP
            </span>
            <span className="truncate text-[0.8125rem] font-semibold">{ctx.organization.name}</span>
          </Link>
        </div>

        <SidebarNav allowed={moduleKeys} permissions={permissions} />

        <div className="shrink-0 border-t px-3 py-2.5 text-[0.6875rem] text-muted-foreground">
          Books in <span className="font-medium text-foreground/80">{ctx.organization.baseCurrency}</span>
          <span aria-hidden> · </span>
          FY starts {MONTHS[ctx.organization.fiscalYearStartMonth - 1]}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
          <MobileNav allowed={moduleKeys} permissions={permissions} orgName={ctx.organization.name} />
          <span className="truncate text-[0.8125rem] font-semibold lg:hidden">
            {ctx.organization.name}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <QuickCreate permissions={permissions} currency={ctx.organization.baseCurrency} />
            <CommandPalette permissions={permissions} />
            <UserMenu user={ctx.user} roleLabel={ROLE_LABELS[ctx.role]} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 lg:px-6">{children}</main>
      </div>
    </div>
  )
}
