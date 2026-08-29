import 'server-only'
import type { DocumentType, Prisma, PurchaseDocumentType } from '@prisma/client'

import { toCalendarDate, toDate, today, type CalendarDate } from '@/lib/date'
import { Decimal, toMoneyString, ZERO } from '@/lib/money'
import { dueDateFor } from '@/lib/payment-terms'
import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { PurchaseDocumentInput } from '@/lib/validation/purchases'
import { systemAccountId } from '@/server/accounting/chart-of-accounts'
import { postJournal, reverseJournal } from '@/server/accounting/posting'
import { priceDocument, type DraftSalesLine } from '@/server/accounting/sales-pricing'
import { recordMovement } from '@/server/accounting/inventory'
import {
  buildBillJournal,
  buildExpenseJournal,
  buildVendorCreditJournal,
  PURCHASE_POSTS_A_JOURNAL,
  type PurchaseJournalInput,
} from '@/server/accounting/builders/purchases'
import type { TaxCodeShape } from '@/server/accounting/tax'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { conflict, notFound, precondition, validation } from '@/server/errors'
import { nextDocumentNumber } from '@/server/sequences'
import { loadCodeForCalculation } from '@/server/services/tax.service'

const SEQUENCE_FOR: Record<PurchaseDocumentType, DocumentType> = {
  BILL: 'BILL',
  EXPENSE: 'EXPENSE',
  VENDOR_CREDIT: 'VENDOR_CREDIT',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
}

const DOCUMENT_SELECT = {
  id: true, type: true, number: true, date: true, dueDate: true, expiryDate: true,
  status: true, reference: true, memo: true,
  subtotal: true, taxTotal: true, total: true,
  currencyCode: true, paymentAccountId: true, journalId: true, version: true,
  voidedAt: true, voidReason: true, convertedFromId: true, paymentTermId: true,
  vendor: { select: { id: true, displayName: true, email: true } },
  paymentTerm: { select: { id: true, name: true, type: true, dueDays: true } },
  paymentAccount: { select: { id: true, code: true, name: true } },
  convertedTo: { select: { id: true, number: true, type: true } },
} satisfies Prisma.PurchaseDocumentSelect

export async function list(
  ctx: OrgContext,
  type: PurchaseDocumentType,
  query: ListQuery,
  options: { status?: string; vendorId?: string } = {},
) {
  const where: Prisma.PurchaseDocumentWhereInput = {
    orgId: ctx.orgId,
    type,
    ...(options.vendorId ? { vendorId: options.vendorId } : {}),
    ...(options.status === 'open' ? { status: { in: ['OPEN', 'PARTIAL'] } } : {}),
    ...(options.status === 'overdue'
      ? { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: toDate(today(ctx.organization.timeZone)) } }
      : {}),
    ...(options.status === 'draft' ? { status: 'DRAFT' } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: 'insensitive' } },
            { reference: { contains: query.q, mode: 'insensitive' } },
            { vendor: { displayName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.purchaseDocument.findMany({
      where,
      select: DOCUMENT_SELECT,
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      ...paginate(query),
    }),
    db.purchaseDocument.count({ where }),
  ])

  const balances = await outstandingBalances(db, rows.map((row) => row.id))

  return paged(
    rows.map((row) => ({
      ...row,
      subtotal: row.subtotal.toString(),
      taxTotal: row.taxTotal.toString(),
      total: row.total.toString(),
      balance: toMoneyString(balances.get(row.id) ?? new Decimal(row.total.toString()), 2),
    })),
    total,
    query,
  )
}

export async function get(ctx: OrgContext, id: string) {
  const document = await db.purchaseDocument.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      ...DOCUMENT_SELECT,
      lines: {
        orderBy: { lineNumber: 'asc' },
        select: {
          id: true, lineNumber: true, description: true, quantity: true, unitPrice: true,
          discountPercent: true, amount: true, taxAmount: true,
          item: { select: { id: true, name: true, sku: true } },
          taxCode: { select: { id: true, name: true } },
          expenseAccount: { select: { id: true, code: true, name: true } },
        },
      },
      applications: {
        select: {
          id: true, amount: true,
          payment: { select: { id: true, number: true, date: true } },
          creditDocument: { select: { id: true, number: true, date: true } },
        },
      },
      journal: { select: { id: true, journalNumber: true, status: true } },
    },
  })
  if (!document) throw notFound('Document')

  const applied = document.applications.reduce((sum, a) => sum.plus(a.amount.toString()), ZERO)
  const total = new Decimal(document.total.toString())

  return {
    ...document,
    subtotal: document.subtotal.toString(),
    taxTotal: document.taxTotal.toString(),
    total: total.toString(),
    lines: document.lines.map((line) => ({
      ...line,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      discountPercent: line.discountPercent?.toString() ?? null,
      amount: line.amount.toString(),
      taxAmount: line.taxAmount.toString(),
    })),
    applications: document.applications.map((a) => ({ ...a, amount: a.amount.toString() })),
    amountApplied: toMoneyString(applied, 2),
    balance: toMoneyString(total.minus(applied), 2),
  }
}

/** What is still owed on each of these bills. Derived, never stored. */
export async function outstandingBalances(
  client: Tx | typeof db,
  documentIds: string[],
): Promise<Map<string, Decimal>> {
  if (documentIds.length === 0) return new Map()

  const rows = await client.$queryRaw<{ id: string; total: string; applied: string }[]>`
    SELECT d.id,
           d.total AS total,
           COALESCE((SELECT SUM(a.amount) FROM purchase_applications a WHERE a."billId" = d.id), 0) AS applied
      FROM purchase_documents d
     WHERE d.id = ANY(${documentIds})
  `

  return new Map(rows.map((row) => [row.id, new Decimal(row.total).minus(row.applied)]))
}

export async function create(
  ctx: OrgContext,
  type: PurchaseDocumentType,
  input: PurchaseDocumentInput,
) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const vendor = await requireVendor(tx, ctx, input.vendorId)
    const lines = await resolveLines(tx, ctx, input.lines, vendor.defaultExpenseAccountId)
    const taxCodes = await loadTaxCodes(tx, ctx, lines)
    const priced = priceDocument(lines, taxCodes, ctx.organization.baseCurrency)

    if (priced.total.isZero() && type !== 'PURCHASE_ORDER') {
      throw validation('A document with no value has nothing to record.')
    }

    const term = input.paymentTermId
      ? await tx.paymentTerm.findFirst({
          where: { id: input.paymentTermId, orgId: ctx.orgId },
          select: { id: true, type: true, dueDays: true },
        })
      : vendor.paymentTerm

    const number = await nextDocumentNumber(tx, ctx.orgId, SEQUENCE_FOR[type])
    const isDraft = input.saveAsDraft === true

    const document = await tx.purchaseDocument.create({
      data: {
        orgId: ctx.orgId,
        type,
        number,
        vendorId: vendor.id,
        date: toDate(input.date),
        dueDate: type === 'BILL' ? toDate(dueDateFor(input.date, term ?? null)) : null,
        expiryDate:
          type === 'PURCHASE_ORDER' && input.expiryDate ? toDate(input.expiryDate) : null,
        paymentTermId: term?.id ?? null,
        status: isDraft ? 'DRAFT' : 'OPEN',
        reference: input.reference ?? null,
        memo: input.memo ?? null,
        subtotal: priced.subtotal.toFixed(4),
        taxTotal: priced.taxTotal.toFixed(4),
        total: priced.total.toFixed(4),
        currencyCode: ctx.organization.baseCurrency,
        paymentAccountId: input.paymentAccountId ?? null,
        createdById: ctx.userId,
        lines: {
          create: priced.lines.map((line) => ({
            orgId: ctx.orgId,
            lineNumber: line.lineNumber,
            itemId: line.source.itemId ?? null,
            description: line.source.description ?? null,
            quantity: line.quantity.toFixed(4),
            unitPrice: line.unitPrice.toFixed(4),
            discountPercent: line.source.discountPercent
              ? new Decimal(line.source.discountPercent).toFixed(4)
              : null,
            amount: line.amount.toFixed(4),
            taxCodeId: line.taxCodeId,
            taxAmount: line.taxAmount.toFixed(4),
            expenseAccountId: line.incomeAccountId,
          })),
        },
      },
      select: { id: true, number: true, total: true, status: true },
    })

    if (!isDraft && PURCHASE_POSTS_A_JOURNAL[type]) {
      await postDocument(tx, ctx, document.id)
    }

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'PurchaseDocument',
        entityId: document.id,
        action: 'CREATE',
        after: { type, number: document.number, total: document.total.toString() },
      },
      meta,
    )

    return { id: document.id, number: document.number }
  })
}

export async function update(ctx: OrgContext, id: string, input: PurchaseDocumentInput) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const existing = await tx.purchaseDocument.findFirst({
      where: { id, orgId: ctx.orgId },
      select: { id: true, type: true, number: true, status: true, journalId: true, version: true, total: true },
    })
    if (!existing) throw notFound('Document')
    if (existing.status === 'VOID') {
      throw precondition('A voided document cannot be edited. Create a new one.')
    }

    const applied = await appliedTotal(tx, id)
    if (!applied.isZero()) {
      throw precondition(
        `${existing.number} has ${toMoneyString(applied, 2)} applied to it. ` +
          `Remove the payments or credits before changing what it says.`,
      )
    }

    const vendor = await requireVendor(tx, ctx, input.vendorId)
    const lines = await resolveLines(tx, ctx, input.lines, vendor.defaultExpenseAccountId)
    const taxCodes = await loadTaxCodes(tx, ctx, lines)
    const priced = priceDocument(lines, taxCodes, ctx.organization.baseCurrency)

    const term = input.paymentTermId
      ? await tx.paymentTerm.findFirst({
          where: { id: input.paymentTermId, orgId: ctx.orgId },
          select: { id: true, type: true, dueDays: true },
        })
      : vendor.paymentTerm

    if (existing.journalId) {
      await reverseJournal(tx, ctx, existing.journalId, { reason: `${existing.number} edited` })
    }

    await tx.purchaseDocumentLine.deleteMany({ where: { documentId: id } })

    await tx.purchaseDocument.update({
      where: { id },
      data: {
        vendorId: vendor.id,
        date: toDate(input.date),
        dueDate: existing.type === 'BILL' ? toDate(dueDateFor(input.date, term ?? null)) : null,
        paymentTermId: term?.id ?? null,
        reference: input.reference ?? null,
        memo: input.memo ?? null,
        subtotal: priced.subtotal.toFixed(4),
        taxTotal: priced.taxTotal.toFixed(4),
        total: priced.total.toFixed(4),
        paymentAccountId: input.paymentAccountId ?? null,
        journalId: null,
        version: { increment: 1 },
        status: input.saveAsDraft ? 'DRAFT' : 'OPEN',
        lines: {
          create: priced.lines.map((line) => ({
            orgId: ctx.orgId,
            lineNumber: line.lineNumber,
            itemId: line.source.itemId ?? null,
            description: line.source.description ?? null,
            quantity: line.quantity.toFixed(4),
            unitPrice: line.unitPrice.toFixed(4),
            discountPercent: line.source.discountPercent
              ? new Decimal(line.source.discountPercent).toFixed(4)
              : null,
            amount: line.amount.toFixed(4),
            taxCodeId: line.taxCodeId,
            taxAmount: line.taxAmount.toFixed(4),
            expenseAccountId: line.incomeAccountId,
          })),
        },
      },
    })

    if (!input.saveAsDraft && PURCHASE_POSTS_A_JOURNAL[existing.type]) {
      await postDocument(tx, ctx, id)
    }

    await writeAudit(
      tx,
      ctx,
      {
        entity: 'PurchaseDocument',
        entityId: id,
        action: 'UPDATE',
        before: { total: existing.total.toString(), version: existing.version },
        after: { total: priced.total.toString(), version: existing.version + 1 },
      },
      meta,
    )

    return { id, number: existing.number }
  })
}

export async function postDocument(tx: Tx, ctx: OrgContext, id: string) {
  const document = await tx.purchaseDocument.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true, type: true, number: true, date: true, memo: true, vendorId: true,
      paymentAccountId: true, journalId: true,
      lines: {
        orderBy: { lineNumber: 'asc' },
        select: {
          id: true, amount: true, taxAmount: true, taxCodeId: true, expenseAccountId: true,
          description: true, quantity: true, unitPrice: true, discountPercent: true, itemId: true,
          item: { select: { id: true, name: true, type: true, inventoryAccountId: true } },
        },
      },
    },
  })
  if (!document) throw notFound('Document')
  if (!PURCHASE_POSTS_A_JOURNAL[document.type]) return null
  if (document.journalId) throw conflict(`${document.number} is already posted.`)

  const taxCodes = await loadTaxCodes(
    tx,
    ctx,
    document.lines.map((line) => ({ taxCodeId: line.taxCodeId })),
  )

  const priced = priceDocument(
    document.lines.map((line) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      discountPercent: line.discountPercent?.toString() ?? null,
      taxCodeId: line.taxCodeId,
      // Tracked stock is priced but not expensed: its cost is added to the
      // inventory asset below instead.
      incomeAccountId: line.item?.type === 'INVENTORY' ? null : line.expenseAccountId,
      isStock: line.item?.type === 'INVENTORY',
    })),
    taxCodes,
    ctx.organization.baseCurrency,
  )

  const input: PurchaseJournalInput = {
    date: toCalendarDate(document.date),
    number: document.number,
    documentId: document.id,
    vendorId: document.vendorId,
    priced,
    payableAccountId: await systemAccountId(tx, ctx.orgId, 'ACCOUNTS_PAYABLE'),
    paymentAccountId: document.paymentAccountId,
    fallbackExpenseAccountId: await systemAccountId(tx, ctx.orgId, 'UNCATEGORISED_EXPENSE'),
    memo: document.memo,
  }

  // Receiving tracked stock values it and adds it to the inventory asset, in the
  // same journal as the payable. Buying stock is not spending: the business has
  // swapped cash for goods, and the expense arrives when they are sold.
  const receivesStock = document.type === 'BILL' || document.type === 'EXPENSE'
  const returnsStock = document.type === 'VENDOR_CREDIT'

  if (receivesStock || returnsStock) {
    const stock = new Map<string, Decimal>()

    for (const line of document.lines) {
      if (line.item?.type !== 'INVENTORY') continue
      if (!line.item.inventoryAccountId) {
        throw precondition(`"${line.item.name}" has no inventory account.`)
      }

      const quantity = new Decimal(line.quantity.toString())
      const priceForLine = priced.lines.find((p) => p.source.itemId === line.item!.id)
      const netAmount = priceForLine?.amount ?? new Decimal(line.amount.toString())
      const unitCost = quantity.isZero() ? new Decimal(0) : netAmount.dividedBy(quantity)

      const movement = await recordMovement(tx, ctx, {
        itemId: line.item.id,
        date: toCalendarDate(document.date),
        type: receivesStock ? 'PURCHASE' : 'PURCHASE_RETURN',
        sourceType: document.type as never,
        sourceId: document.id,
        sourceLineId: line.id,
        quantity: receivesStock ? quantity : quantity.negated(),
        unitCost: receivesStock ? unitCost : undefined,
      })

      stock.set(
        line.item.inventoryAccountId,
        (stock.get(line.item.inventoryAccountId) ?? new Decimal(0)).plus(movement.value.abs()),
      )
    }

    input.stock = [...stock.entries()].map(([inventoryAccountId, amount]) => ({
      inventoryAccountId,
      amount,
    }))
  }

  const draft =
    document.type === 'BILL'
      ? buildBillJournal(input)
      : document.type === 'EXPENSE'
        ? buildExpenseJournal(input)
        : buildVendorCreditJournal(input)

  const journal = await postJournal(tx, ctx, draft)

  await tx.inventoryTransaction.updateMany({
    where: { orgId: ctx.orgId, sourceId: document.id, journalId: null },
    data: { journalId: journal.id },
  })

  await tx.purchaseDocument.update({
    where: { id },
    data: { journalId: journal.id, status: 'OPEN' },
  })

  await refreshStatus(tx, id)
  return journal
}

export async function voidDocument(ctx: OrgContext, id: string, reason: string) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const document = await tx.purchaseDocument.findFirst({
      where: { id, orgId: ctx.orgId },
      select: { id: true, number: true, status: true, journalId: true },
    })
    if (!document) throw notFound('Document')
    if (document.status === 'VOID') throw conflict(`${document.number} is already void.`)

    const applied = await appliedTotal(tx, id)
    if (!applied.isZero()) {
      throw precondition(
        `${document.number} has ${toMoneyString(applied, 2)} applied to it. Remove that first.`,
      )
    }

    if (document.journalId) {
      await reverseJournal(tx, ctx, document.journalId, {
        reason: `${document.number} voided — ${reason}`,
      })
    }

    await tx.purchaseDocument.update({
      where: { id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'PurchaseDocument', entityId: id, action: 'REVERSE', after: { status: 'VOID', reason } },
      meta,
    )

    return { id, number: document.number }
  })
}

/** Turn a purchase order into a bill once the goods arrive. */
export async function convertOrder(ctx: OrgContext, orderId: string, date: CalendarDate) {
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const order = await tx.purchaseDocument.findFirst({
      where: { id: orderId, orgId: ctx.orgId, type: 'PURCHASE_ORDER' },
      select: {
        id: true, number: true, status: true, vendorId: true, reference: true, memo: true,
        paymentTermId: true, convertedTo: { select: { number: true } },
        lines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            itemId: true, description: true, quantity: true, unitPrice: true,
            discountPercent: true, taxCodeId: true, expenseAccountId: true,
          },
        },
      },
    })
    if (!order) throw notFound('Purchase order')
    if (order.convertedTo) {
      throw conflict(`${order.number} has already become bill ${order.convertedTo.number}.`)
    }
    if (order.status === 'VOID') {
      throw precondition(`${order.number} is void and cannot be received.`)
    }

    const bill = await create(ctx, 'BILL', {
      vendorId: order.vendorId,
      date,
      reference: order.reference,
      memo: order.memo,
      paymentTermId: order.paymentTermId,
      lines: order.lines.map((line) => ({
        itemId: line.itemId,
        expenseAccountId: line.expenseAccountId,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        discountPercent: line.discountPercent?.toString() ?? null,
        taxCodeId: line.taxCodeId,
      })),
    } as PurchaseDocumentInput)

    await tx.purchaseDocument.update({ where: { id: bill.id }, data: { convertedFromId: orderId } })
    await tx.purchaseDocument.update({ where: { id: orderId }, data: { status: 'CLOSED' } })

    await writeAudit(
      tx,
      ctx,
      { entity: 'PurchaseDocument', entityId: orderId, action: 'UPDATE', after: { convertedTo: bill.number } },
      meta,
    )

    return bill
  })
}

export async function refreshStatus(tx: Tx, documentId: string) {
  const document = await tx.purchaseDocument.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, total: true, status: true },
  })
  if (!document) return
  if (document.status === 'VOID' || document.status === 'DRAFT') return
  if (document.type !== 'BILL') return

  const applied = await appliedTotal(tx, documentId)
  const total = new Decimal(document.total.toString())

  const status = applied.greaterThanOrEqualTo(total)
    ? 'PAID'
    : applied.greaterThan(0)
      ? 'PARTIAL'
      : 'OPEN'

  if (status !== document.status) {
    await tx.purchaseDocument.update({ where: { id: documentId }, data: { status } })
  }
}

/* --- Helpers -------------------------------------------------------------- */

async function appliedTotal(tx: Tx, documentId: string): Promise<Decimal> {
  const result = await tx.purchaseApplication.aggregate({
    where: { billId: documentId },
    _sum: { amount: true },
  })
  return new Decimal(result._sum.amount?.toString() ?? '0')
}

async function requireVendor(tx: Tx, ctx: OrgContext, vendorId: string) {
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, orgId: ctx.orgId },
    select: {
      id: true,
      isActive: true,
      displayName: true,
      defaultExpenseAccountId: true,
      paymentTerm: { select: { id: true, type: true, dueDays: true } },
    },
  })
  if (!vendor) throw notFound('Vendor')
  if (!vendor.isActive) {
    throw precondition(`${vendor.displayName} is archived. Restore them before entering a bill.`)
  }
  return vendor
}

/**
 * Resolve each line's cost account.
 *
 * A purchase line is categorised in one of three ways, in order of precedence:
 * what the line says, what the item says, then the vendor's default. If none of
 * them answers, the posting engine falls back to Uncategorised Expense — visible
 * on the profit and loss, which is the point: money that went somewhere unnamed
 * should be conspicuous rather than hidden.
 *
 * A tracked item is different: its cost belongs to the inventory asset, not to an
 * expense account, so its line carries the item's inventory account instead.
 */
async function resolveLines(
  tx: Tx,
  ctx: OrgContext,
  lines: PurchaseDocumentInput['lines'],
  vendorDefaultAccountId: string | null,
): Promise<DraftSalesLine[]> {
  const itemIds = lines.map((line) => line.itemId).filter(Boolean) as string[]

  const items = itemIds.length
    ? await tx.item.findMany({
        where: { id: { in: itemIds }, orgId: ctx.orgId },
        select: {
          id: true, name: true, type: true, isActive: true, purchaseCost: true,
          purchaseDescription: true, description: true, expenseAccountId: true,
          purchaseTaxCodeId: true, inventoryAccountId: true,
        },
      })
    : []

  const byId = new Map(items.map((item) => [item.id, item]))

  return lines.map((line): DraftSalesLine => {
    const item = line.itemId ? byId.get(line.itemId) : null
    if (line.itemId && !item) throw notFound('Item')
    if (item && !item.isActive) {
      throw precondition(`"${item.name}" is archived and cannot be bought.`)
    }

    return {
      itemId: line.itemId ?? null,
      description:
        line.description ?? item?.purchaseDescription ?? item?.description ?? item?.name ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice !== '' ? line.unitPrice : (item?.purchaseCost?.toString() ?? '0'),
      discountPercent: line.discountPercent ?? null,
      taxCodeId: line.taxCodeId ?? item?.purchaseTaxCodeId ?? null,
      // `incomeAccountId` is the pricing engine's neutral name for "where this
      // line posts". On a purchase that is the expense or asset account — and for
      // tracked stock it is handled separately, so it is left unset here.
      incomeAccountId:
        item?.type === 'INVENTORY'
          ? null
          : (line.expenseAccountId ?? item?.expenseAccountId ?? vendorDefaultAccountId ?? null),
      isStock: item?.type === 'INVENTORY',
    }
  })
}

async function loadTaxCodes(
  tx: Tx,
  ctx: OrgContext,
  lines: { taxCodeId?: string | null }[],
): Promise<Map<string, TaxCodeShape>> {
  const ids = [...new Set(lines.map((line) => line.taxCodeId).filter(Boolean) as string[])]
  const codes = new Map<string, TaxCodeShape>()

  for (const id of ids) {
    const code = await loadCodeForCalculation(tx, ctx.orgId, id)
    if (!code) throw notFound('Tax code')
    codes.set(id, code)
  }

  return codes
}
