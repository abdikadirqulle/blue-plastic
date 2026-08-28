'use client'

import { useState } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarNav } from './sidebar-nav'

export function MobileNav({ allowed, orgName }: { allowed: string[]; orgName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[85%] flex-col border-r bg-sidebar shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="truncate text-sm font-semibold">{orgName}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Close navigation" onClick={() => setOpen(false)}>
                <XIcon />
              </Button>
            </div>
            <SidebarNav allowed={allowed} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  )
}
