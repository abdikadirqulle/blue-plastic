'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { DELIVERED_PHASE, NAV, type NavItem } from './nav-items'

/**
 * Client only because it reads the active pathname. The permission filtering
 * happened on the server — this component receives an allow-list of hrefs and
 * cannot widen it.
 */
export function SidebarNav({ allowed, onNavigate }: { allowed: string[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const allowedSet = new Set(allowed)

  const isActive = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((item) => allowedSet.has(item.href))
        if (items.length === 0) return null

        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 pb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {items.map((item) => {
              const available = item.phase <= DELIVERED_PHASE
              const Icon = item.icon

              if (!available) {
                return (
                  <span
                    key={item.href}
                    title={`Arrives in phase ${item.phase}`}
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground/45"
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto text-[0.625rem] tabular">P{item.phase}</span>
                  </span>
                )
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive(item)
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
