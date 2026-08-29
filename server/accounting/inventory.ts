import 'server-only'
import type { InventoryMovementType, JournalSourceType } from '@prisma/client'

import { toDate, type CalendarDate } from '@/lib/date'
import { Decimal, roundToCurrency, ZERO } from '@/lib/money'
import type { OrgContext } from '@/server/auth/context'
import type { Tx } from '@/server/db'
import { precondition } from '@/server/errors'

/**
 * Perpetual inventory at weighted-average cost.
 *
 * ## The arithmetic
 *
 * Receiving stock adds to both quantity and value, and the average follows:
 *
 *     value += quantity × cost
 *     quantity += quantity
 *     average = value / quantity
 *
 * Issuing stock takes out at the average as it stands at that moment, which
 * leaves the average unchanged — that is the property that makes weighted
 * average simple to keep right.
 *
 * ## Why entry order, not date order
 *
 * Each movement carries the item's position *after* it. That makes the ledger
 * checkable — a trigger verifies every row against its predecessor — but it also
 * means the chain has a single order, and it is the order movements were
 * recorded, not the order they are dated.
 *
 * So a purchase back-dated behind a sale does **not** restate that sale's cost of
 * goods. The cost was what the books knew at the time; the difference flows into
 * later averages instead. The alternative — recomputing the chain and reversing
 * already-posted COGS journals — restates a profit figure that has been reported,
 * to correct an entry someone made late. Between a small timing difference and a
 * moving history, accounting prefers the timing difference.
 *
 * ## The invariant
 *
 * `sum(value)` across an item's movements equals its `runningValue`, and the sum
 * across all items equals the Inventory Asset balance in the general ledger —
 * because every movement posts exactly its own `value` there, in the same
 * transaction that writes the movement. A test asserts it.
 */

export type StockPosition = {
  quantity: Decimal
  value: Decimal
  /** value / quantity, or zero when there is no stock. */
  averageCost: Decimal
  sequence: number
}

export type MovementRequest = {
  itemId: string
  date: CalendarDate
  type: InventoryMovementType
  sourceType: JournalSourceType
  sourceId?: string | null
  sourceLineId?: string | null
  /** Signed: positive received, negative issued. */
  quantity: Decimal.Value
  /** Required on a receipt. Ignored on an issue, which always costs at average. */
  unitCost?: Decimal.Value | null
}

export type RecordedMovement = {
  id: string
  itemId: string
  quantity: Decimal
  unitCost: Decimal
  /** Signed value change, and exactly what is posted to Inventory Asset. */
  value: Decimal
  position: StockPosition
}

/** Where an item stands right now. */
export async function positionOf(tx: Tx, itemId: string): Promise<StockPosition> {
  const last = await tx.inventoryTransaction.findFirst({
    where: { itemId },
    orderBy: { sequence: 'desc' },
    select: { runningQuantity: true, runningValue: true, sequence: true },
  })

  if (!last) return { quantity: ZERO, value: ZERO, averageCost: ZERO, sequence: 0 }

  const quantity = new Decimal(last.runningQuantity.toString())
  const value = new Decimal(last.runningValue.toString())

  return {
    quantity,
    value,
    averageCost: quantity.isZero() ? ZERO : value.dividedBy(quantity).toDecimalPlaces(6, Decimal.ROUND_HALF_UP),
    sequence: last.sequence,
  }
}

/** Where several items stand, in one query. */
export async function positionsOf(
  tx: Tx,
  orgId: string,
  itemIds: string[],
): Promise<Map<string, StockPosition>> {
  if (itemIds.length === 0) return new Map()

  const rows = await tx.$queryRaw<
    { itemId: string; runningQuantity: string; runningValue: string; sequence: number }[]
  >`
    SELECT DISTINCT ON (t."itemId")
           t."itemId"          AS "itemId",
           t."runningQuantity" AS "runningQuantity",
           t."runningValue"    AS "runningValue",
           t.sequence          AS "sequence"
      FROM inventory_transactions t
     WHERE t."orgId" = ${orgId}
       AND t."itemId" = ANY(${itemIds})
     ORDER BY t."itemId", t.sequence DESC
  `

  const positions = new Map<string, StockPosition>()
  for (const id of itemIds) {
    positions.set(id, { quantity: ZERO, value: ZERO, averageCost: ZERO, sequence: 0 })
  }

  for (const row of rows) {
    const quantity = new Decimal(row.runningQuantity)
    const value = new Decimal(row.runningValue)
    positions.set(row.itemId, {
      quantity,
      value,
      averageCost: quantity.isZero()
        ? ZERO
        : value.dividedBy(quantity).toDecimalPlaces(6, Decimal.ROUND_HALF_UP),
      sequence: row.sequence,
    })
  }

  return positions
}

/**
 * Record one movement and return what it did.
 *
 * The caller posts `value` to the Inventory Asset account in the same
 * transaction. Nothing here writes a journal — keeping the stock ledger and the
 * general ledger separate is what lets the equality between them be a test rather
 * than an assumption.
 */
export async function recordMovement(
  tx: Tx,
  ctx: OrgContext,
  request: MovementRequest,
  options: { journalId?: string | null } = {},
): Promise<RecordedMovement> {
  const item = await tx.item.findFirst({
    where: { id: request.itemId, orgId: ctx.orgId },
    select: { id: true, name: true, type: true },
  })
  if (!item) throw precondition('That item does not exist.')
  if (item.type !== 'INVENTORY') {
    throw precondition(`"${item.name}" is not a tracked item, so it has no stock to move.`)
  }

  const before = await positionOf(tx, request.itemId)
  const quantity = new Decimal(request.quantity)
  const currency = ctx.organization.baseCurrency

  let unitCost: Decimal
  let value: Decimal

  if (quantity.isPositive()) {
    if (request.unitCost === undefined || request.unitCost === null) {
      // A purchase must say what was paid — there is no defensible guess.
      if (request.type === 'PURCHASE' || request.type === 'OPENING') {
        throw precondition(`Receiving "${item.name}" needs a unit cost.`)
      }
      // Stock coming back from a customer, or found by a count, re-enters at
      // what the books already carry it at. Anything else would move the average
      // for a reason that has nothing to do with what the business paid.
      unitCost = before.averageCost.isZero()
        ? await lastKnownCost(tx, request.itemId)
        : before.averageCost
    } else {
      unitCost = new Decimal(request.unitCost)
    }
    if (unitCost.isNegative()) {
      throw precondition('A unit cost cannot be negative.')
    }
    value = roundToCurrency(quantity.times(unitCost), currency)
  } else {
    // An issue leaves at the average as it stands. That is the whole method.
    const available = before.quantity
    const issuing = quantity.abs()

    if (issuing.greaterThan(available)) {
      if (!ctx.organization.allowNegativeStock) {
        throw precondition(
          `There ${available.equals(1) ? 'is' : 'are'} ${available.toFixed(2)} of "${item.name}" in stock ` +
            `and this needs ${issuing.toFixed(2)}. Receive the stock first, or allow negative stock in ` +
            `settings and accept that the cost is an estimate until it arrives.`,
        )
      }
    }

    // With no stock at all there is no average to use, so the last known cost
    // stands in and is trued up by the next receipt.
    unitCost = before.averageCost.isZero()
      ? await lastKnownCost(tx, request.itemId)
      : before.averageCost

    value = roundToCurrency(quantity.times(unitCost), currency)
  }

  const position: StockPosition = {
    quantity: before.quantity.plus(quantity),
    value: before.value.plus(value),
    averageCost: ZERO,
    sequence: before.sequence + 1,
  }
  position.averageCost = position.quantity.isZero()
    ? ZERO
    : position.value.dividedBy(position.quantity).toDecimalPlaces(6, Decimal.ROUND_HALF_UP)

  // When stock returns to zero, any rounding residue would otherwise sit in the
  // Inventory Asset account for ever, attached to nothing. It is squeezed out
  // here so that "no stock" always means "no value".
  if (position.quantity.isZero() && !position.value.isZero()) {
    value = value.minus(position.value)
    position.value = ZERO
  }

  const movement = await tx.inventoryTransaction.create({
    data: {
      orgId: ctx.orgId,
      itemId: request.itemId,
      date: toDate(request.date),
      type: request.type,
      sourceType: request.sourceType,
      sourceId: request.sourceId ?? null,
      sourceLineId: request.sourceLineId ?? null,
      quantity: quantity.toFixed(4),
      unitCost: unitCost.toFixed(6),
      value: value.toFixed(4),
      runningQuantity: position.quantity.toFixed(4),
      runningValue: position.value.toFixed(4),
      sequence: position.sequence,
      journalId: options.journalId ?? null,
      createdById: ctx.userId,
    },
    select: { id: true },
  })

  return { id: movement.id, itemId: request.itemId, quantity, unitCost, value, position }
}

/** The cost of the last receipt, for costing an issue made against no stock. */
async function lastKnownCost(tx: Tx, itemId: string): Promise<Decimal> {
  const receipt = await tx.inventoryTransaction.findFirst({
    where: { itemId, quantity: { gt: 0 } },
    orderBy: { sequence: 'desc' },
    select: { unitCost: true },
  })
  if (receipt) return new Decimal(receipt.unitCost.toString())

  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { purchaseCost: true },
  })
  return new Decimal(item?.purchaseCost?.toString() ?? '0')
}

/**
 * The value the stock ledger says is held, per item and in total.
 *
 * Compared against the Inventory Asset account by `stockAgreesWithLedger`, which
 * is the check that makes the whole design trustworthy.
 */
export async function valuation(tx: Tx, orgId: string) {
  const rows = await tx.$queryRaw<
    {
      itemId: string
      name: string
      sku: string | null
      quantity: string
      value: string
      reorderPoint: string | null
    }[]
  >`
    SELECT i.id             AS "itemId",
           i.name           AS "name",
           i.sku            AS "sku",
           COALESCE(t."runningQuantity", 0) AS "quantity",
           COALESCE(t."runningValue", 0)    AS "value",
           i."reorderPoint" AS "reorderPoint"
      FROM items i
      LEFT JOIN LATERAL (
        SELECT "runningQuantity", "runningValue"
          FROM inventory_transactions
         WHERE "itemId" = i.id
         ORDER BY sequence DESC
         LIMIT 1
      ) t ON true
     WHERE i."orgId" = ${orgId}
       AND i.type = 'INVENTORY'
     ORDER BY i.name
  `

  const items = rows.map((row) => {
    const quantity = new Decimal(row.quantity)
    const value = new Decimal(row.value)
    return {
      itemId: row.itemId,
      name: row.name,
      sku: row.sku,
      quantity,
      value,
      averageCost: quantity.isZero() ? ZERO : value.dividedBy(quantity).toDecimalPlaces(6),
      reorderPoint: row.reorderPoint ? new Decimal(row.reorderPoint) : null,
      belowReorder: row.reorderPoint ? quantity.lessThanOrEqualTo(row.reorderPoint) : false,
    }
  })

  return {
    items,
    totalValue: items.reduce((sum, item) => sum.plus(item.value), ZERO),
  }
}

/**
 * Does the stock ledger agree with the general ledger?
 *
 * If these two ever differ, one of them is lying about what the business owns.
 * The check exists as a report and as a test, because an invariant nobody
 * verifies is an invariant nobody has.
 */
export async function stockAgreesWithLedger(tx: Tx, orgId: string) {
  const stock = await valuation(tx, orgId)

  const [row] = await tx.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_lines l
      JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
      JOIN ledger_accounts a ON a.id = l."accountId"
     WHERE l."orgId" = ${orgId}
       AND a."systemKey" = 'INVENTORY_ASSET'
  `

  const ledgerBalance = new Decimal(row?.balance ?? '0')

  return {
    stockValue: stock.totalValue,
    ledgerBalance,
    difference: stock.totalValue.minus(ledgerBalance),
    agrees: stock.totalValue.equals(ledgerBalance),
  }
}
