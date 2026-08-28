import 'server-only'

import type { OrgContext } from '@/server/auth/context'
import { db } from '@/server/db'

/** Everything the bill form needs, in one round trip. */
export async function loadPurchaseOptions(ctx: OrgContext) {
  const [vendors, items, taxCodes, paymentAccounts, expenseAccounts, terms] = await Promise.all([
    db.vendor.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, displayName: true, defaultExpenseAccountId: true },
      orderBy: { displayName: 'asc' },
    }),
    db.item.findMany({
      where: { orgId: ctx.orgId, isActive: true, type: { not: 'INVENTORY' } },
      select: {
        id: true, name: true, sku: true, purchaseCost: true,
        purchaseDescription: true, description: true, purchaseTaxCodeId: true,
        expenseAccountId: true,
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
      where: { orgId: ctx.orgId, isActive: true, subtype: { in: ['BANK', 'CREDIT_CARD'] } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    // Costs land in expenses, or in assets when something is capitalised.
    db.ledgerAccount.findMany({
      where: { orgId: ctx.orgId, isActive: true, type: { in: ['EXPENSE', 'ASSET', 'LIABILITY'] } },
      select: { id: true, code: true, name: true, type: true, parentId: true },
      orderBy: { code: 'asc' },
    }),
    db.paymentTerm.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, name: true, type: true, dueDays: true },
      orderBy: [{ isDefault: 'desc' }, { dueDays: 'asc' }],
    }),
  ])

  const parents = new Set(expenseAccounts.map((a) => a.parentId).filter(Boolean) as string[])

  return {
    vendors: vendors.map((vendor) => ({
      id: vendor.id,
      label: vendor.displayName,
      defaultExpenseAccountId: vendor.defaultExpenseAccountId,
    })),
    items: items.map((item) => ({
      id: item.id,
      label: item.sku ? `${item.sku} — ${item.name}` : item.name,
      price: item.purchaseCost?.toString() ?? null,
      description: item.purchaseDescription ?? item.description ?? item.name,
      taxCodeId: item.purchaseTaxCodeId,
      expenseAccountId: item.expenseAccountId,
    })),
    taxCodes: taxCodes.map((code) => ({
      id: code.id,
      label: code.name,
      isInclusive: code.isInclusive,
      rate: code.components.reduce((total, c) => total + Number(c.taxRate.rate), 0),
    })),
    paymentAccounts: paymentAccounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    expenseAccounts: expenseAccounts
      .filter((a) => !parents.has(a.id))
      .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    terms,
  }
}
