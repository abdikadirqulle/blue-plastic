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

import { DeleteMenuItem, type DeleteTarget } from '@/components/data/delete-record'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
 * It used to hold navigation and nothing else, on the reasoning that a
 * destructive action two clicks deep in a table of near-identical rows is how
 * the wrong invoice gets voided. That reasoning was right about the risk and
 * wrong about the remedy: what it produced was an application in which nothing
 * could be deleted from any list, and the only way to undo a mistyped bill was
 * to know that its own page had a button. People stopped correcting things.
 *
 * So Delete lives here now, but it is not a click. It is the last item,
 * separated from the navigation, in the destructive colour, and it opens the
 * same dialog as the record page — which names the record and says exactly what
 * deleting it will take with it before anything happens.
 */
export function RowActions({
  actions,
  onDelete,
  label = 'Actions',
}: {
  actions: RowAction[]
  /** The row's Delete entry, when it has one. */
  onDelete?: DeleteTarget
  label?: string
}) {
  if (actions.length === 0 && !onDelete) return null

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

        {onDelete && actions.length > 0 ? <DropdownMenuSeparator /> : null}
        {onDelete ? <DeleteMenuItem {...onDelete} /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
