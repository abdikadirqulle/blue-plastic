'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, PencilIcon } from 'lucide-react'
import { toast } from 'sonner'

import {
  ItemDialog,
  type AccountOption,
  type ItemValues,
  type SimpleOption,
} from '@/components/master-data/item-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import { setItemsActive } from './actions'

export type ItemRow = ItemValues & {
  id: string
  name: string
  type: 'SERVICE' | 'NON_INVENTORY' | 'INVENTORY'
  isActive: boolean
  incomeAccount: { code: string; name: string } | null
  inventoryAccount: { code: string; name: string } | null
  cogsAccount: { code: string; name: string } | null
  category: { name: string } | null
}

const TYPE_LABEL = {
  SERVICE: 'Service',
  NON_INVENTORY: 'Non-inventory',
  INVENTORY: 'Inventory',
} as const

export function ItemTable({
  rows,
  accounts,
  taxCodes,
  categories,
  currency,
  canEdit,
  canArchive,
}: {
  rows: ItemRow[]
  accounts: AccountOption[]
  taxCodes: SimpleOption[]
  categories: SimpleOption[]
  currency: string
  canEdit: boolean
  canArchive: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [isPending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))

  const bulk = (isActive: boolean) =>
    startTransition(async () => {
      const result = await setItemsActive({ ids: [...selected], isActive })
      if (result.ok) {
        toast.success(`${result.data.count} ${isActive ? 'restored' : 'archived'}.`)
        setSelected(new Set())
        router.refresh()
      } else {
        toast.error(result.error.message)
      }
    })

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
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="size-4 rounded border-input"
                />
              </TableHead>
            ) : null}
            <TableHead>Item</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead>Posts to</TableHead>
            <TableHead className="numeric w-28">Price</TableHead>
            <TableHead className="numeric w-28">Cost</TableHead>
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
                    aria-label={`Select ${row.name}`}
                    checked={selected.has(row.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (next.has(row.id)) next.delete(row.id)
                        else next.add(row.id)
                        return next
                      })
                    }
                    className="size-4 rounded border-input"
                  />
                </TableCell>
              ) : null}
              <TableCell>
                <span className="block font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.sku ? `${row.sku} · ` : ''}
                  {row.category?.name ?? 'Uncategorised'}
                </span>
                {!row.isActive ? (
                  <Badge variant="outline" className="mt-1">
                    archived
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={row.type === 'INVENTORY' ? 'default' : 'secondary'}>
                  {TYPE_LABEL[row.type]}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <span className="block">
                  Income: {row.incomeAccount ? `${row.incomeAccount.code} ${row.incomeAccount.name}` : '—'}
                </span>
                {row.type === 'INVENTORY' ? (
                  <>
                    <span className="block">
                      Stock:{' '}
                      {row.inventoryAccount
                        ? `${row.inventoryAccount.code} ${row.inventoryAccount.name}`
                        : '—'}
                    </span>
                    <span className="block">
                      COGS: {row.cogsAccount ? `${row.cogsAccount.code} ${row.cogsAccount.name}` : '—'}
                    </span>
                  </>
                ) : null}
              </TableCell>
              <TableCell className="numeric tabular">
                {row.salesPrice ? formatMoney(row.salesPrice, currency) : '—'}
              </TableCell>
              <TableCell className="numeric tabular">
                {row.purchaseCost ? formatMoney(row.purchaseCost, currency) : '—'}
              </TableCell>
              <TableCell>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${row.name}`}
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
        <ItemDialog
          mode="edit"
          item={editing}
          accounts={accounts}
          taxCodes={taxCodes}
          categories={categories}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
