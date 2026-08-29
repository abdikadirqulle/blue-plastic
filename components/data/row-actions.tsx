'use client'

import Link from 'next/link'
import {
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PrinterIcon,
  RotateCcwIcon,
  XCircleIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Icons are named, not passed.
 *
 * A React component is a function, and a function cannot cross the boundary from
 * a Server Component into a Client one — React refuses it, because there is no
 * way to serialise it. So the server sends a string and the client looks it up.
 */
const ICONS = {
  open: EyeIcon,
  edit: PencilIcon,
  print: PrinterIcon,
  void: XCircleIcon,
  reverse: RotateCcwIcon,
} as const

export type RowActionIcon = keyof typeof ICONS

export type RowAction = {
  label: string
  href: string
  icon?: RowActionIcon
  /** Rendered in the destructive colour. Does not itself confirm anything. */
  destructive?: boolean
}

/**
 * The menu at the end of a row.
 *
 * Only navigation lives here. Anything that changes the ledger — voiding a
 * document, undoing a reconciliation — keeps its own button on the record's own
 * page, where there is room to say what it will do before it does it. A
 * destructive action two clicks deep in a row menu, with a table of
 * near-identical rows around it, is how the wrong invoice gets voided.
 */
export function RowActions({ actions, label = 'Actions' }: { actions: RowAction[]; label?: string }) {
  if (actions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const Icon = action.icon ? ICONS[action.icon] : null
          return (
            <DropdownMenuItem
              key={action.href + action.label}
              asChild
              variant={action.destructive ? 'destructive' : undefined}
            >
              <Link href={action.href}>
                {Icon ? <Icon className="size-4" /> : null}
                {action.label}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
