import 'server-only'
import type { Prisma } from '@prisma/client'

import { today } from '@/lib/date'
import { Decimal } from '@/lib/money'
import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { ItemInput } from '@/lib/validation/master-data'
import { systemAccountId } from '@/server/accounting/chart-of-accounts'
import { positionsOf, recordMovement } from '@/server/accounting/inventory'
import { postJournal } from '@/server/accounting/posting'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { conflict, notFound, validation } from '@/server/errors'

const ITEM_SELECT = {
  id: true, sku: true, name: true, description: true, type: true, categoryId: true,
  unitOfMeasure: true,
  salesDescription: true, salesPrice: true, incomeAccountId: true, isTaxable: true, salesTaxCodeId: true,
  purchaseDescription: true, purchaseCost: true, expenseAccountId: true, purchaseTaxCodeId: true,
  inventoryAccountId: true, cogsAccountId: true, reorderPoint: true,
  isActive: true,
  category: { select: { id: true, name: true } },
  incomeAccount: { select: { id: true, code: true, name: true } },
  expenseAccount: { select: { id: true, code: true, name: true } },
  inventoryAccount: { select: { id: true, code: true, name: true } },
  cogsAccount: { select: { id: true, code: true, name: true } },
  salesTaxCode: { select: { id: true, name: true } },
  purchaseTaxCode: { select: { id: true, name: true } },
} satisfies Prisma.ItemSelect

function serialise<T extends { salesPrice: unknown; purchaseCost: unknown; reorderPoint: unknown }>(item: T) {
  return {
    ...item,
    salesPrice: item.salesPrice?.toString() ?? null,
    purchaseCost: item.purchaseCost?.toString() ?? null,
    reorderPoint: item.reorderPoint?.toString() ?? null,
  }
}

/** Orderings the list screen offers. Sorting happens here, over every row. */
const ITEM_ORDER: Record<string, (dir: 'asc' | 'desc') => Prisma.ItemOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  type: (dir) => [{ type: dir }, { name: 'asc' }],
  price: (dir) => [{ salesPrice: dir }, { name: 'asc' }],
  cost: (dir) => [{ purchaseCost: dir }, { name: 'asc' }],
  sku: (dir) => [{ sku: dir }, { name: 'asc' }],
}

export async function list(
  ctx: OrgContext,
  query: ListQuery,
  options: { includeInactive?: boolean; type?: string; sort?: string; dir?: 'asc' | 'desc' } = {},
) {
  const where: Prisma.ItemWhereInput = {
    orgId: ctx.orgId,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(options.type ? { type: options.type as Prisma.EnumItemTypeFilter['equals'] } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { sku: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.item.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: (options.sort ? ITEM_ORDER[options.sort]?.(options.dir ?? 'asc') : undefined) ?? [
        { name: 'asc' },
      ],
      ...paginate(query),
    }),
    db.item.count({ where }),
  ])

  // Stock travels with the item, because stock *is* a property of the item —
  // not a separate register kept somewhere else. The products list shows what
  // is on hand and what it is worth, so nobody has to hold two screens in their
  // head to answer "have we got any?".
  const trackedIds = rows.filter((row) => row.type === 'INVENTORY').map((row) => row.id)
  const positions = await positionsOf(db as unknown as Tx, ctx.orgId, trackedIds)

  return paged(
    rows.map((row) => {
      const position = positions.get(row.id)
      return {
        ...serialise(row),
        onHand: position ? position.quantity.toFixed(2) : null,
        stockValue: position ? position.value.toFixed(2) : null,
        averageCost: position ? position.averageCost.toFixed(4) : null,
        belowReorder:
          position && row.reorderPoint
            ? position.quantity.lessThanOrEqualTo(row.reorderPoint.toString())
            : false,
      }
    }),
    total,
    query,
  )
}

export async function get(ctx: OrgContext, id: string) {
  const item = await db.item.findFirst({ where: { id, orgId: ctx.orgId }, select: ITEM_SELECT })
  if (!item) throw notFound('Item')
  return serialise(item)
}

export async function create(ctx: OrgContext, input: ItemInput) {
  await assertNameAndSkuFree(ctx, input.name, input.sku ?? null)
  await assertAccountsSuitable(ctx, input)
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: { orgId: ctx.orgId, ...toData(input) },
      select: { id: true, name: true, type: true },
    })

    // Stock setup is part of creating an inventory item, not a separate errand
    // in another module. It posts like any other receipt: the value goes into
    // the inventory account against Opening Balance Equity, and the stock ledger
    // gets its first movement — so the item is usable the moment it exists.
    const openingQuantity = new Decimal(input.openingQuantity ?? '0')

    if (item.type === 'INVENTORY' && openingQuantity.greaterThan(0)) {
      const date = input.openingDate ?? today(ctx.organization.timeZone)

      const movement = await recordMovement(tx, ctx, {
        itemId: item.id,
        date,
        type: 'OPENING',
        sourceType: 'OPENING_BALANCE',
        sourceId: item.id,
        quantity: openingQuantity,
        unitCost: input.openingUnitCost ?? '0',
      })

      if (!movement.value.isZero()) {
        const journal = await postJournal(tx, ctx, {
          date,
          memo: `Opening stock — ${item.name}`,
          sourceType: 'OPENING_BALANCE',
          sourceId: item.id,
          lines: [
            {
              accountId: input.inventoryAccountId!,
              debit: movement.value,
              description: `${openingQuantity.toFixed(2)} × ${movement.unitCost.toFixed(4)}`,
            },
            {
              accountId: await systemAccountId(tx, ctx.orgId, 'OPENING_BALANCE_EQUITY'),
              credit: movement.value,
              description: `Opening stock — ${item.name}`,
            },
          ],
        })

        await tx.inventoryTransaction.updateMany({
          where: { orgId: ctx.orgId, itemId: item.id, journalId: null },
          data: { journalId: journal.id },
        })
      }
    }

    await writeAudit(tx, ctx, { entity: 'Item', entityId: item.id, action: 'CREATE', after: item }, meta)
    return item
  })
}

export async function update(ctx: OrgContext, input: ItemInput & { id: string }) {
  const before = await db.item.findFirst({ where: { id: input.id, orgId: ctx.orgId }, select: ITEM_SELECT })
  if (!before) throw notFound('Item')

  await assertNameAndSkuFree(ctx, input.name, input.sku ?? null, input.id)
  await assertAccountsSuitable(ctx, input)

  // Changing what an item *is* would reclassify everything already sold through
  // it, so the type is fixed once the item exists.
  if (before.type !== input.type) {
    throw validation(
      `An item's type cannot be changed after it is created — it would reclassify every document that already used it. Create a new item instead.`,
      { type: ['Type cannot be changed'] },
    )
  }

  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const after = await tx.item.update({
      where: { id: input.id },
      data: toData(input),
      select: { id: true, name: true, type: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'Item', entityId: after.id, action: 'UPDATE', before: serialise(before), after },
      meta,
    )
    return after
  })
}

export async function setActive(ctx: OrgContext, ids: string[], isActive: boolean) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const result = await tx.item.updateMany({
      where: { id: { in: ids }, orgId: ctx.orgId },
      data: { isActive },
    })

    for (const id of ids) {
      await writeAudit(
        tx,
        ctx,
        { entity: 'Item', entityId: id, action: isActive ? 'RESTORE' : 'ARCHIVE', after: { isActive } },
        meta,
      )
    }

    return { count: result.count }
  })
}

export async function listCategories(ctx: OrgContext) {
  return db.itemCategory.findMany({
    where: { orgId: ctx.orgId, isActive: true },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: 'asc' },
  })
}

function toData(input: ItemInput) {
  return {
    sku: input.sku ?? null,
    name: input.name,
    description: input.description ?? null,
    type: input.type,
    categoryId: input.categoryId ?? null,
    unitOfMeasure: input.unitOfMeasure ?? null,
    salesDescription: input.salesDescription ?? null,
    salesPrice: input.salesPrice ?? null,
    incomeAccountId: input.incomeAccountId ?? null,
    isTaxable: input.isTaxable,
    salesTaxCodeId: input.salesTaxCodeId ?? null,
    purchaseDescription: input.purchaseDescription ?? null,
    purchaseCost: input.purchaseCost ?? null,
    expenseAccountId: input.expenseAccountId ?? null,
    purchaseTaxCodeId: input.purchaseTaxCodeId ?? null,
    inventoryAccountId: input.inventoryAccountId ?? null,
    cogsAccountId: input.cogsAccountId ?? null,
    reorderPoint: input.reorderPoint ?? null,
  }
}

async function assertNameAndSkuFree(ctx: OrgContext, name: string, sku: string | null, selfId?: string) {
  const byName = await db.item.findUnique({
    where: { orgId_name: { orgId: ctx.orgId, name } },
    select: { id: true },
  })
  if (byName && byName.id !== selfId) {
    throw conflict(`Another item is already called "${name}".`)
  }

  if (sku) {
    const bySku = await db.item.findUnique({
      where: { orgId_sku: { orgId: ctx.orgId, sku } },
      select: { id: true, name: true },
    })
    if (bySku && bySku.id !== selfId) {
      throw validation(`SKU "${sku}" already belongs to "${bySku.name}".`, {
        sku: [`Already used by "${bySku.name}"`],
      })
    }
  }
}

/**
 * The database enforces this too. Doing it here first is what turns
 * "check_violation on trg_item_account_mapping" into a sentence that names the
 * field and says why.
 */
async function assertAccountsSuitable(ctx: OrgContext, input: ItemInput) {
  const ids = [
    input.incomeAccountId,
    input.expenseAccountId,
    input.inventoryAccountId,
    input.cogsAccountId,
  ].filter(Boolean) as string[]

  if (ids.length === 0) return

  const accounts = await db.ledgerAccount.findMany({
    where: { id: { in: ids }, orgId: ctx.orgId },
    select: { id: true, name: true, type: true, subtype: true, isActive: true },
  })
  const byId = new Map(accounts.map((a) => [a.id, a]))

  for (const id of ids) {
    const account = byId.get(id)
    if (!account) throw notFound('Account')
    if (!account.isActive) {
      throw validation(`"${account.name}" is archived and cannot be used for posting.`)
    }
  }

  const income = input.incomeAccountId ? byId.get(input.incomeAccountId) : null
  if (income && income.type !== 'REVENUE') {
    throw validation(`"${income.name}" is not an income account, so sales cannot be posted to it.`, {
      incomeAccountId: ['Choose an income account'],
    })
  }

  const expense = input.expenseAccountId ? byId.get(input.expenseAccountId) : null
  if (expense && expense.type !== 'EXPENSE') {
    throw validation(`"${expense.name}" is not an expense account.`, {
      expenseAccountId: ['Choose an expense account'],
    })
  }

  const cogs = input.cogsAccountId ? byId.get(input.cogsAccountId) : null
  if (cogs && cogs.type !== 'EXPENSE') {
    throw validation(`"${cogs.name}" is not an expense account, so cost of sales cannot be posted to it.`, {
      cogsAccountId: ['Choose an expense account'],
    })
  }

  const inventory = input.inventoryAccountId ? byId.get(input.inventoryAccountId) : null
  if (inventory && inventory.subtype !== 'INVENTORY') {
    throw validation(`"${inventory.name}" is not an inventory account, so stock value cannot be held in it.`, {
      inventoryAccountId: ['Choose an inventory account'],
    })
  }
}
