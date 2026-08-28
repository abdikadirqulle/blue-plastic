import 'server-only'

import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'

/**
 * Everything the document form needs to render, in one round trip.
 *
 * Fetched on the server and passed down as props: the form is interactive, but
 * it is not a place to discover what exists.
 */
export async function loadFormOptions(ctx: OrgContext) {
  const [customers, items, taxCodes, accounts, terms] = await Promise.all([
    db.customer.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    db.item.findMany({
      where: { orgId: ctx.orgId, isActive: true, type: { not: 'INVENTORY' } },
      select: {
        id: true, name: true, sku: true, salesPrice: true,
        salesDescription: true, description: true, salesTaxCodeId: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.taxCode.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: {
        id: true, name: true, isInclusive: true,
        components: { select: { taxRate: { select: { rate: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    db.ledgerAccount.findMany({
      where: {
        orgId: ctx.orgId,
        isActive: true,
        subtype: { in: ['BANK', 'UNDEPOSITED_FUNDS'] },
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    db.paymentTerm.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, name: true, type: true, dueDays: true },
      orderBy: [{ isDefault: 'desc' }, { dueDays: 'asc' }],
    }),
  ])

  return {
    customers: customers.map((customer) => ({ id: customer.id, label: customer.displayName })),
    items: items.map((item) => ({
      id: item.id,
      label: item.sku ? `${item.sku} — ${item.name}` : item.name,
      price: item.salesPrice?.toString() ?? null,
      description: item.salesDescription ?? item.description ?? item.name,
      taxCodeId: item.salesTaxCodeId,
    })),
    taxCodes: taxCodes.map((code) => ({
      id: code.id,
      label: code.name,
      isInclusive: code.isInclusive,
      // A preview figure only. The server recomputes with full precision and
      // compound sequencing before anything is posted.
      rate: code.components.reduce((total, component) => total + Number(component.taxRate.rate), 0),
    })),
    depositAccounts: accounts.map((account) => ({
      id: account.id,
      label: `${account.code} ${account.name}`,
    })),
    terms,
  }
}
