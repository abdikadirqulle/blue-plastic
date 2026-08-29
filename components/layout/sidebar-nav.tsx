'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { MODULES, moduleFor } from './nav-items'

/**
 * Nine entries, no headings.
 *
 * Client only because it reads the active pathname. The permission filtering
 * happened on the server — this component receives an allow-list of module keys
 * and cannot widen it.
 */
export function SidebarNav({ allowed, onNavigate }: { allowed: string[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const allowedSet = new Set(allowed)
  const current = moduleFor(pathname)

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
      {MODULES.filter((entry) => allowedSet.has(entry.key)).map((entry) => {
        const active = current?.key === entry.key
        const Icon = entry.icon

        return (
          <Link
            key={entry.key}
            href={entry.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{entry.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
