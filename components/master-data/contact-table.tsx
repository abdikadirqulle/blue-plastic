'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, PencilIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SortableHeader, type SortState } from '@/components/data/sortable-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import {
  setCustomersActive,
  setVendorsActive,
} from '@/app/(app)/customers/actions'
import { ContactDialog, type ContactSide, type ContactValues, type Option } from './contact-dialog'

export type ContactRow = ContactValues & {
  id: string
  displayName: string
  isActive: boolean
  balance: string
  paymentTerm: { name: string } | null
}

/**
 * Selection is client state; everything it acts on is a server action. The table
 * itself is rendered from server-fetched data — this component adds interaction,
 * not fetching.
 */
export function ContactTable({
  side,
  rows,
  terms,
  expenseAccounts = [],
  currency,
  today,
  canEdit,
  canArchive,
  sort,
  basePath,
  linkParams,
}: {
  side: ContactSide
  rows: ContactRow[]
  terms: Option[]
  expenseAccounts?: Option[]
  currency: string
  today: string
  canEdit: boolean
  canArchive: boolean
  /** Sorting is server-side, over every row — see SortableHeader. */
  sort: SortState
  basePath: string
  linkParams: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<ContactRow | null>(null)
  const [isPending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const balanceLabel = side === 'customer' ? 'Owes you' : 'You owe'

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const bulk = (isActive: boolean) => {
    const ids = [...selected]
    startTransition(async () => {
      const run = side === 'customer' ? setCustomersActive : setVendorsActive
      const result = await run({ ids, isActive })
      if (result.ok) {
        toast.success(`${result.data.count} ${isActive ? 'restored' : 'archived'}.`)
        setSelected(new Set())
        router.refresh()
      } else {
        toast.error(result.error.message)
      }
    })
  }

  return (
    <>
      {selected.size > 0 && canArchive ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="tabular font-medium">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => bulk(false)}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <ArchiveIcon />} Archive
            </Button>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => bulk(true)}>
              <ArchiveRestoreIcon /> Restore
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            {canArchive ? (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 rounded border-input"
                />
              </TableHead>
            ) : null}
            <SortableHeader column="name" label="Name" state={sort} basePath={basePath} params={linkParams} />
            <SortableHeader column="email" label="Contact" state={sort} basePath={basePath} params={linkParams} />
            <TableHead>Terms</TableHead>
            <TableHead className="numeric w-32">{balanceLabel}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={row.isActive ? undefined : 'opacity-55'}>
              {canArchive ? (
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.displayName}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    className="size-4 rounded border-input"
                  />
                </TableCell>
              ) : null}
              <TableCell>
                <Link
                  href={`/${side === 'customer' ? 'customers' : 'vendors'}/${row.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.displayName}
                </Link>
                {row.companyName && row.companyName !== row.displayName ? (
                  <span className="block text-xs text-muted-foreground">{row.companyName}</span>
                ) : null}
                {!row.isActive ? (
                  <Badge variant="outline" className="mt-1">
                    archived
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="block">{row.email ?? '—'}</span>
                {row.phone ? <span className="block text-xs">{row.phone}</span> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.paymentTerm?.name ?? '—'}</TableCell>
              <TableCell className="numeric tabular">
                {row.balance === '0.00' ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatMoney(row.balance, currency)
                )}
              </TableCell>
              <TableCell>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${row.displayName}`}
                    onClick={() => setEditing(row)}
                  >
                    <PencilIcon />
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing ? (
        <ContactDialog
          side={side}
          mode="edit"
          contact={editing}
          terms={terms}
          expenseAccounts={expenseAccounts}
          today={today}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
