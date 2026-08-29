import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangleIcon, CheckCircle2Icon, PackageIcon, ScaleIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as inventoryService from '@/server/services/inventory.service'

export const metadata: Metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const ctx = await requireOrgContext('inventory:read')

  const [stock, agreement, adjustments] = await Promise.all([
    inventoryService.stockOnHand(ctx),
    inventoryService.agreement(ctx),
    inventoryService.listAdjustments(ctx),
  ])

  const currency = ctx.organization.baseCurrency
  const canAdjust = ctx.permissions.has('inventory:adjust')
  const lowStock = stock.items.filter((item) => item.belowReorder)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand at weighted-average cost. Selling a tracked item moves the stock and posts its cost in the same entry as the sale."
        actions={
          canAdjust ? (
            <Link href="/inventory/adjustments/new" className={buttonVariants({ size: 'sm' })}>
              <ScaleIcon /> Adjust stock
            </Link>
          ) : undefined
        }
      />

      {stock.items.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="No tracked items yet"
          description="Create a product with the Inventory type, giving it an inventory account and a cost of goods sold account. It will appear here as soon as some is received."
          action={
            <Link href="/items" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Products and services
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Stock value</p>
                <p className="tabular mt-0.5 text-lg font-semibold">
                  {formatMoney(stock.totalValue, currency)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Tracked items</p>
                <p className="tabular mt-0.5 text-lg font-semibold">{stock.items.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">At or below reorder point</p>
                <p className="tabular mt-0.5 text-lg font-semibold">
                  {lowStock.length === 0 ? '—' : lowStock.length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="numeric w-28">On hand</TableHead>
                  <TableHead className="numeric w-32">Average cost</TableHead>
                  <TableHead className="numeric w-32">Value</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.items.map((item) => (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <Link
                        href={`/inventory/${item.itemId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.name}
                      </Link>
                      {item.sku ? (
                        <span className="block text-xs text-muted-foreground">{item.sku}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="numeric tabular">
                      {item.quantity.toFixed(2)}
                      {item.quantity.isNegative() ? (
                        <Badge variant="destructive" className="ml-2">
                          negative
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="numeric tabular text-muted-foreground">
                      {item.averageCost.isZero() ? '—' : formatMoney(item.averageCost, currency)}
                    </TableCell>
                    <TableCell className="numeric tabular font-medium">
                      {formatMoney(item.value, currency)}
                    </TableCell>
                    <TableCell>
                      {item.belowReorder ? (
                        <Badge variant="warning">
                          reorder at {item.reorderPoint?.toFixed(0)}
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="numeric tabular font-semibold">
                    {formatMoney(stock.totalValue, currency)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <div
              className={`flex items-start gap-2 border-t px-3 py-2.5 text-sm ${
                agreement.agrees ? 'text-success' : 'text-destructive'
              }`}
            >
              {agreement.agrees ? (
                <>
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Agrees with the Inventory Asset account at{' '}
                    <span className="tabular">{formatMoney(agreement.ledgerBalance, currency)}</span>.
                    Every movement posts its own value to the ledger, in the same transaction.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Stock is worth{' '}
                    <strong className="tabular">{formatMoney(agreement.stockValue, currency)}</strong> but
                    the Inventory Asset account holds{' '}
                    <strong className="tabular">{formatMoney(agreement.ledgerBalance, currency)}</strong>.
                    One of them is wrong about what the business owns — investigate before relying on
                    either.
                  </span>
                </>
              )}
            </div>
          </Card>
        </>
      )}

      <h2 className="mb-3 text-sm font-semibold">Adjustments</h2>

      {adjustments.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No adjustments yet. A stock count that disagrees with the books is recorded here, and the
            difference goes to Inventory Shrinkage rather than being buried in cost of goods sold.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Number</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="numeric w-20">Items</TableHead>
                <TableHead className="numeric w-32">Value change</TableHead>
                <TableHead className="w-28">Entry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adjustment) => (
                <TableRow key={adjustment.id}>
                  <TableCell className="tabular font-medium">{adjustment.number}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                    {formatDate(toCalendarDate(adjustment.date))}
                  </TableCell>
                  <TableCell>{adjustment.reason ?? adjustment.memo ?? '—'}</TableCell>
                  <TableCell className="numeric tabular">{adjustment.lineCount}</TableCell>
                  <TableCell className="numeric tabular">
                    {formatMoney(adjustment.totalValue, currency)}
                  </TableCell>
                  <TableCell>
                    {adjustment.journal ? (
                      <Link
                        href={`/journals/${adjustment.journal.id}`}
                        className="tabular text-sm underline-offset-4 hover:underline"
                      >
                        {adjustment.journal.journalNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
