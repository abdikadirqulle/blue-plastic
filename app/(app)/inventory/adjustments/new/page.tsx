import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { AdjustmentForm } from '@/components/inventory/adjustment-form'
import { buttonVariants } from '@/components/ui/button'
import { accountOptions } from '@/lib/account-options'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import * as inventoryService from '@/server/services/inventory.service'

export const metadata: Metadata = { title: 'Adjust stock' }

export default async function NewAdjustmentPage() {
  const ctx = await requireOrgContext('inventory:adjust')

  const [stock, accounts] = await Promise.all([
    inventoryService.stockOnHand(ctx),
    accountService.selectableAccounts(ctx),
  ])

  return (
    <>
      <Link href="/inventory" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Inventory
      </Link>

      <PageHeader
        title="Adjust stock"
        description="Enter what the count actually found. The difference in value goes to Inventory Shrinkage — stock that has gone missing is an expense, and burying it in cost of goods sold would flatter the margin on everything that did sell."
      />

      <AdjustmentForm
        items={stock.items.map((item) => ({
          id: item.itemId,
          label: item.sku ? `${item.sku} — ${item.name}` : item.name,
          onHand: item.quantity.toFixed(2),
          averageCost: item.averageCost.toFixed(6),
        }))}
        accounts={accountOptions(accounts, {
          prefer: ['OPERATING_EXPENSE', 'COST_OF_GOODS_SOLD', 'OTHER_EXPENSE'],
          preferTypes: ['EXPENSE', 'REVENUE'],
        })}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
