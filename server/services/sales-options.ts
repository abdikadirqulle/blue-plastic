import 'server-only'

import { accountOptions, MONEY_SUBTYPES } from '@/lib/account-options'
import { Decimal } from '@/lib/money'
import { positionsOf } from '@/server/accounting/inventory'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { selectableAccounts } from '@/server/services/account.service'

/**
 * Everything the document form needs to render, in one round trip.
 *
 * Fetched on the server and passed down as props: the form is interactive, but
 * it is not a place to discover what exists.
 */
export async function loadFormOptions(ctx: OrgContext) {
  const [customers, items, taxCodes, chart, terms] = await Promise.all([
    db.customer.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    // Every item the business sells, tracked stock included. Leaving inventory
    // items out of the picker is what made them unsellable.
    db.item.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: {
        id: true, name: true, sku: true, salesPrice: true, type: true,
        salesDescription: true, description: true, salesTaxCodeId: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    db.taxCode.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: {
        id: true, name: true, isInclusive: true,
        components: { select: { taxRate: { select: { rate: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    selectableAccounts(ctx, { withBalances: true }),
    db.paymentTerm.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, name: true, type: true, dueDays: true },
      orderBy: [{ isDefault: 'desc' }, { dueDays: 'asc' }],
    }),
  ])

  // Stock on hand, so choosing a tracked item on an invoice line shows what is
  // actually there rather than being discovered at posting time.
  const trackedIds = items.filter((item) => item.type === 'INVENTORY').map((item) => item.id)
  const positions = await positionsOf(db as unknown as Tx, ctx.orgId, trackedIds)

  return {
    customers: customers.map((customer) => ({ id: customer.id, label: customer.displayName })),
    items: items.map((item) => ({
      id: item.id,
      label: item.sku ? `${item.sku} — ${item.name}` : item.name,
      price: item.salesPrice?.toString() ?? null,
      description: item.salesDescription ?? item.description ?? item.name,
      taxCodeId: item.salesTaxCodeId,
      type: item.type,
      group: ITEM_GROUPS[item.type],
      onHand:
        item.type === 'INVENTORY'
          ? (positions.get(item.id)?.quantity ?? new Decimal(0)).toFixed(2)
          : null,
    })),
    taxCodes: taxCodes.map((code) => ({
      id: code.id,
      label: code.name,
      isInclusive: code.isInclusive,
      // A preview figure only. The server recomputes with full precision and
      // compound sequencing before anything is posted.
      rate: code.components.reduce((total, component) => total + Number(component.taxRate.rate), 0),
    })),
    // Where the money lands on a receipt or a refund. Bank and undeposited funds
    // lead; the whole chart follows.
    depositAccounts: accountOptions(chart, {
      prefer: ['BANK', 'UNDEPOSITED_FUNDS', 'CREDIT_CARD', 'OTHER_CURRENT_ASSET'],
      showBalance: true,
    }),
    terms,
  }
}

export const ITEM_GROUPS: Record<string, string> = {
  INVENTORY: 'Inventory products',
  NON_INVENTORY: 'Non-inventory products',
  SERVICE: 'Services',
}

export { MONEY_SUBTYPES }
