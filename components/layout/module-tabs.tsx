'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'
import { moduleFor, tabFor } from './nav-items'

/**
 * The second level of navigation, in one place for every module.
 *
 * It lives in the shell rather than in each module's layout, so the tabs are in
 * the same position on every screen and there is one implementation to get the
 * active state right in. Modules with no tabs render nothing at all, and the row
 * takes no vertical space when it is empty.
 */
function Tabs({ allowed }: { allowed: string[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const section = moduleFor(pathname)
  if (!section?.tabs?.length) return null

  const allowedSet = new Set(allowed)
  const tabs = section.tabs.filter((tab) => !tab.permission || allowedSet.has(tab.permission))
  if (tabs.length < 2) return null

  const active = tabFor(section, pathname)
  const query = section.preserveQuery ? searchParams.toString() : ''

  return (
    <div className="sticky top-14 z-20 border-b bg-background/85 backdrop-blur-sm">
      <nav
        aria-label={`${section.label} sections`}
        className="flex gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8"
      >
        {tabs.map((tab) => {
          const isActive = active?.href === tab.href
          return (
            <Link
              key={tab.href}
              href={query ? `${tab.href}?${query}` : tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

/** useSearchParams suspends during prerender, and the tabs are chrome. */
export function ModuleTabs({ allowed }: { allowed: string[] }) {
  return (
    <Suspense fallback={<div className="h-11 border-b" />}>
      <Tabs allowed={allowed} />
    </Suspense>
  )
}
