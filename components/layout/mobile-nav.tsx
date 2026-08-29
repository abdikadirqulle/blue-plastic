'use client'

import { useState } from 'react'
import { MenuIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SidebarNav } from './sidebar-nav'

/**
 * The same navigation, in a drawer.
 *
 * On the dialog primitive rather than a hand-rolled overlay, which is what makes
 * it behave: the page behind it stops scrolling, Escape closes it, focus is
 * trapped inside it and returns to the button afterwards. Tapping a link closes
 * it too — a drawer that stays open over the page you just asked for is the most
 * common way a mobile navigation feels broken.
 */
export function MobileNav({
  allowed,
  permissions,
  orgName,
}: {
  allowed: string[]
  permissions: string[]
  orgName: string
}) {
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          className={
            // A drawer, not a centred box: full height, pinned to the left edge.
            'left-0 top-0 h-svh max-h-svh w-72 max-w-[85vw] translate-x-0 rounded-none border-y-0 border-l-0 p-0 sm:top-0 sm:max-w-[85vw] sm:translate-y-0 lg:hidden'
          }
        >
          <div className="flex h-full flex-col">
            <div className="flex h-14 shrink-0 items-center border-b px-4 pr-12">
              <DialogTitle className="truncate text-sm font-semibold">{orgName}</DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              Navigate to a section of the application.
            </DialogDescription>
            <SidebarNav
              allowed={allowed}
              permissions={permissions}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
