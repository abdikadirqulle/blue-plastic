import 'server-only'
import type { Prisma } from '@prisma/client'

import { Decimal, toMoneyString } from '@/lib/money'
import { today } from '@/lib/date'
import { type ListQuery, paged, paginate } from '@/lib/validation/common'
import type { CustomerInput, VendorInput } from '@/lib/validation/master-data'
import { systemAccountId } from '@/server/accounting/chart-of-accounts'
import { postJournal } from '@/server/accounting/posting'
import { requestMeta, writeAudit } from '@/server/audit'
import type { OrgContext } from '@/server/auth/context'
import { db, type Tx } from '@/server/db'
import { conflict, notFound, precondition, validation } from '@/server/errors'

/**
 * Customers and vendors are the same shape with opposite signs: one owes the
 * business, the other is owed by it. Sharing the implementation keeps the two
 * subledgers behaving identically, which is exactly what an accountant expects.
 */
type Side = 'customer' | 'vendor'

/** Optional fields shared by both sides. `displayName` is handled separately: it is required. */
const OPTIONAL_CONTACT_FIELDS = [
  'companyName', 'firstName', 'lastName', 'email', 'phone', 'mobile',
  'taxRegistrationNumber', 'billingLine1', 'billingLine2', 'billingCity',
  'billingRegion', 'billingPostalCode', 'billingCountry', 'paymentTermId', 'notes',
] as const

const CUSTOMER_SELECT = {
  id: true, displayName: true, companyName: true, firstName: true, lastName: true,
  email: true, phone: true, mobile: true, taxRegistrationNumber: true,
  billingLine1: true, billingLine2: true, billingCity: true, billingRegion: true,
  billingPostalCode: true, billingCountry: true,
  shippingLine1: true, shippingLine2: true, shippingCity: true, shippingRegion: true,
  shippingPostalCode: true, shippingCountry: true,
  paymentTermId: true, creditLimit: true, notes: true, isActive: true, createdAt: true,
  paymentTerm: { select: { id: true, name: true, type: true, dueDays: true } },
} satisfies Prisma.CustomerSelect

const VENDOR_SELECT = {
  id: true, displayName: true, companyName: true, firstName: true, lastName: true,
  email: true, phone: true, mobile: true, taxRegistrationNumber: true,
  billingLine1: true, billingLine2: true, billingCity: true, billingRegion: true,
  billingPostalCode: true, billingCountry: true,
  paymentTermId: true, defaultExpenseAccountId: true, notes: true, isActive: true, createdAt: true,
  paymentTerm: { select: { id: true, name: true, type: true, dueDays: true } },
  defaultExpenseAccount: { select: { id: true, code: true, name: true } },
} satisfies Prisma.VendorSelect

/* --- Reading -------------------------------------------------------------- */

/** Orderings the list screens offer. Sorting happens here, over every row. */
const CONTACT_ORDER = <T extends { displayName?: unknown }>(sort: string | undefined, dir: 'asc' | 'desc') => {
  switch (sort) {
    case 'name':
      return [{ displayName: dir }] as T[]
    case 'email':
      return [{ email: dir }, { displayName: 'asc' }] as T[]
    case 'phone':
      return [{ phone: dir }, { displayName: 'asc' }] as T[]
    case 'company':
      return [{ companyName: dir }, { displayName: 'asc' }] as T[]
    default:
      return undefined
  }
}

export async function listCustomers(
  ctx: OrgContext,
  query: ListQuery,
  options: { includeInactive?: boolean; sort?: string; dir?: 'asc' | 'desc' } = {},
) {
  const where: Prisma.CustomerWhereInput = {
    orgId: ctx.orgId,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(query.q ? { OR: searchTerms(query.q) } : {}),
  }

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy:
        CONTACT_ORDER<Prisma.CustomerOrderByWithRelationInput>(options.sort, options.dir ?? 'asc') ?? [
          { displayName: 'asc' },
        ],
      ...paginate(query),
    }),
    db.customer.count({ where }),
  ])

  const balances = await subledgerBalances(db, ctx, 'customer', rows.map((r) => r.id))

  return paged(
    rows.map((row) => ({
      ...row,
      creditLimit: row.creditLimit?.toString() ?? null,
      balance: toMoneyString(balances.get(row.id) ?? 0, 2),
    })),
    total,
    query,
  )
}

export async function listVendors(
  ctx: OrgContext,
  query: ListQuery,
  options: { includeInactive?: boolean; sort?: string; dir?: 'asc' | 'desc' } = {},
) {
  const where: Prisma.VendorWhereInput = {
    orgId: ctx.orgId,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(query.q ? { OR: searchTerms(query.q) } : {}),
  }

  const [rows, total] = await Promise.all([
    db.vendor.findMany({
      where,
      select: VENDOR_SELECT,
      orderBy:
        CONTACT_ORDER<Prisma.VendorOrderByWithRelationInput>(options.sort, options.dir ?? 'asc') ?? [
          { displayName: 'asc' },
        ],
      ...paginate(query),
    }),
    db.vendor.count({ where }),
  ])

  const balances = await subledgerBalances(db, ctx, 'vendor', rows.map((r) => r.id))

  return paged(
    rows.map((row) => ({ ...row, balance: toMoneyString(balances.get(row.id) ?? 0, 2) })),
    total,
    query,
  )
}

export async function getCustomer(ctx: OrgContext, id: string) {
  const customer = await db.customer.findFirst({
    where: { id, orgId: ctx.orgId },
    select: CUSTOMER_SELECT,
  })
  if (!customer) throw notFound('Customer')

  const balances = await subledgerBalances(db, ctx, 'customer', [id])
  return {
    ...customer,
    creditLimit: customer.creditLimit?.toString() ?? null,
    balance: toMoneyString(balances.get(id) ?? 0, 2),
  }
}

export async function getVendor(ctx: OrgContext, id: string) {
  const vendor = await db.vendor.findFirst({
    where: { id, orgId: ctx.orgId },
    select: VENDOR_SELECT,
  })
  if (!vendor) throw notFound('Vendor')

  const balances = await subledgerBalances(db, ctx, 'vendor', [id])
  return { ...vendor, balance: toMoneyString(balances.get(id) ?? 0, 2) }
}

/**
 * What each contact owes, straight from the ledger.
 *
 * This is the whole argument for R7. The aging report and the AR control account
 * are the same rows read two ways, so they cannot drift apart — there is no
 * separate balance to reconcile, and no reconciliation job to forget to run.
 */
export async function subledgerBalances(
  client: Tx | typeof db,
  ctx: OrgContext,
  side: Side,
  ids: string[],
): Promise<Map<string, Decimal>> {
  if (ids.length === 0) return new Map()

  const rows =
    side === 'customer'
      ? await client.$queryRaw<{ id: string; debit: string; credit: string }[]>`
          SELECT l."customerId" AS id,
                 COALESCE(SUM(l.debit), 0)  AS debit,
                 COALESCE(SUM(l.credit), 0) AS credit
            FROM journal_lines l
            JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
           WHERE l."orgId" = ${ctx.orgId}
             AND l."customerId" = ANY(${ids})
           GROUP BY l."customerId"
        `
      : await client.$queryRaw<{ id: string; debit: string; credit: string }[]>`
          SELECT l."vendorId" AS id,
                 COALESCE(SUM(l.debit), 0)  AS debit,
                 COALESCE(SUM(l.credit), 0) AS credit
            FROM journal_lines l
            JOIN journals j ON j.id = l."journalId" AND j.status <> 'DRAFT'
           WHERE l."orgId" = ${ctx.orgId}
             AND l."vendorId" = ANY(${ids})
           GROUP BY l."vendorId"
        `

  return new Map(
    rows.map((row) => [
      row.id,
      // Receivables are debit balances, payables are credit balances. Both are
      // shown positive when the contact owes what you would expect them to.
      side === 'customer'
        ? new Decimal(row.debit).minus(row.credit)
        : new Decimal(row.credit).minus(row.debit),
    ]),
  )
}

/* --- Writing -------------------------------------------------------------- */

export async function createCustomer(ctx: OrgContext, input: CustomerInput) {
  await assertNameFree(ctx, 'customer', input.displayName)
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        orgId: ctx.orgId,
        ...pickContact(input),
        shippingLine1: input.shippingLine1 ?? null,
        shippingLine2: input.shippingLine2 ?? null,
        shippingCity: input.shippingCity ?? null,
        shippingRegion: input.shippingRegion ?? null,
        shippingPostalCode: input.shippingPostalCode ?? null,
        shippingCountry: input.shippingCountry ?? null,
        creditLimit: input.creditLimit ?? null,
      },
      select: { id: true, displayName: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'Customer', entityId: customer.id, action: 'CREATE', after: customer },
      meta,
    )

    await postOpeningBalance(tx, ctx, 'customer', customer.id, customer.displayName, input)
    return customer
  })
}

export async function createVendor(ctx: OrgContext, input: VendorInput) {
  await assertNameFree(ctx, 'vendor', input.displayName)
  await assertExpenseAccount(ctx, input.defaultExpenseAccountId ?? null)
  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: {
        orgId: ctx.orgId,
        ...pickContact(input),
        defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
      },
      select: { id: true, displayName: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'Vendor', entityId: vendor.id, action: 'CREATE', after: vendor },
      meta,
    )

    await postOpeningBalance(tx, ctx, 'vendor', vendor.id, vendor.displayName, input)
    return vendor
  })
}

export async function updateCustomer(ctx: OrgContext, input: CustomerInput & { id: string }) {
  const before = await db.customer.findFirst({
    where: { id: input.id, orgId: ctx.orgId },
    select: CUSTOMER_SELECT,
  })
  if (!before) throw notFound('Customer')
  if (before.displayName !== input.displayName) {
    await assertNameFree(ctx, 'customer', input.displayName, input.id)
  }

  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const after = await tx.customer.update({
      where: { id: input.id },
      data: {
        ...pickContact(input),
        shippingLine1: input.shippingLine1 ?? null,
        shippingLine2: input.shippingLine2 ?? null,
        shippingCity: input.shippingCity ?? null,
        shippingRegion: input.shippingRegion ?? null,
        shippingPostalCode: input.shippingPostalCode ?? null,
        shippingCountry: input.shippingCountry ?? null,
        creditLimit: input.creditLimit ?? null,
      },
      select: { id: true, displayName: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'Customer', entityId: after.id, action: 'UPDATE', before, after },
      meta,
    )
    return after
  })
}

export async function updateVendor(ctx: OrgContext, input: VendorInput & { id: string }) {
  const before = await db.vendor.findFirst({
    where: { id: input.id, orgId: ctx.orgId },
    select: VENDOR_SELECT,
  })
  if (!before) throw notFound('Vendor')
  if (before.displayName !== input.displayName) {
    await assertNameFree(ctx, 'vendor', input.displayName, input.id)
  }
  await assertExpenseAccount(ctx, input.defaultExpenseAccountId ?? null)

  const meta = await requestMeta()

  return db.$transaction(async (tx) => {
    const after = await tx.vendor.update({
      where: { id: input.id },
      data: {
        ...pickContact(input),
        defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
      },
      select: { id: true, displayName: true },
    })

    await writeAudit(
      tx,
      ctx,
      { entity: 'Vendor', entityId: after.id, action: 'UPDATE', before, after },
      meta,
    )
    return after
  })
}

/**
 * Archive or restore. Contacts are never deleted — a posted line references them
 * forever, and the foreign key from journal_lines refuses it anyway.
 *
 * Archiving is blocked while a balance is outstanding: hiding a customer who
 * still owes money is how a receivable gets forgotten.
 */
export async function setActive(ctx: OrgContext, side: Side, ids: string[], isActive: boolean) {
  const meta = await requestMeta()

  if (!isActive) {
    const balances = await subledgerBalances(db, ctx, side, ids)
    const outstanding = [...balances.entries()].filter(([, balance]) => !balance.isZero())

    if (outstanding.length > 0) {
      const names =
        side === 'customer'
          ? await db.customer.findMany({
              where: { id: { in: outstanding.map(([id]) => id) } },
              select: { displayName: true },
            })
          : await db.vendor.findMany({
              where: { id: { in: outstanding.map(([id]) => id) } },
              select: { displayName: true },
            })

      throw precondition(
        `${names.map((n) => n.displayName).join(', ')} still ${names.length === 1 ? 'has' : 'have'} an ` +
          `outstanding balance. Settle or write it off before archiving, or it will vanish from view while ` +
          `remaining in the accounts.`,
      )
    }
  }

  return db.$transaction(async (tx) => {
    const result =
      side === 'customer'
        ? await tx.customer.updateMany({ where: { id: { in: ids }, orgId: ctx.orgId }, data: { isActive } })
        : await tx.vendor.updateMany({ where: { id: { in: ids }, orgId: ctx.orgId }, data: { isActive } })

    for (const id of ids) {
      await writeAudit(
        tx,
        ctx,
        {
          entity: side === 'customer' ? 'Customer' : 'Vendor',
          entityId: id,
          action: isActive ? 'RESTORE' : 'ARCHIVE',
          after: { isActive },
        },
        meta,
      )
    }

    return { count: result.count }
  })
}

/* --- Opening balances ----------------------------------------------------- */

/**
 * An opening balance is a journal, never a column.
 *
 * Customer: debit Accounts Receivable, credit Opening Balance Equity.
 * Vendor:   debit Opening Balance Equity, credit Accounts Payable.
 *
 * The AR/AP line carries its counterparty, which is what R7 demands and what
 * makes the balance show up on the aging report as well as in the control
 * account.
 */
async function postOpeningBalance(
  tx: Tx,
  ctx: OrgContext,
  side: Side,
  id: string,
  name: string,
  input: { openingBalance?: string | null; openingBalanceDate?: string | null },
) {
  if (!input.openingBalance) return
  const amount = new Decimal(input.openingBalance)
  if (amount.isZero()) return

  if (amount.isNegative()) {
    throw validation(
      'An opening balance cannot be negative. Enter what is owed; a credit is recorded later as a credit memo.',
      { openingBalance: ['Enter a positive amount'] },
    )
  }

  const control = await systemAccountId(
    tx,
    ctx.orgId,
    side === 'customer' ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE',
  )
  const equity = await systemAccountId(tx, ctx.orgId, 'OPENING_BALANCE_EQUITY')
  const date = input.openingBalanceDate ?? today(ctx.organization.timeZone)

  await postJournal(tx, ctx, {
    date,
    memo: `Opening balance — ${name}`,
    sourceType: 'OPENING_BALANCE',
    sourceId: id,
    lines:
      side === 'customer'
        ? [
            { accountId: control, debit: amount, customerId: id },
            { accountId: equity, credit: amount },
          ]
        : [
            { accountId: equity, debit: amount },
            { accountId: control, credit: amount, vendorId: id },
          ],
  })
}

/* --- Helpers -------------------------------------------------------------- */

function searchTerms(q: string) {
  return [
    { displayName: { contains: q, mode: 'insensitive' as const } },
    { companyName: { contains: q, mode: 'insensitive' as const } },
    { email: { contains: q, mode: 'insensitive' as const } },
    { phone: { contains: q, mode: 'insensitive' as const } },
  ]
}

function pickContact(input: CustomerInput | VendorInput) {
  const optional: Record<string, string | null> = {}
  for (const field of OPTIONAL_CONTACT_FIELDS) {
    const value = (input as Record<string, unknown>)[field]
    optional[field] = typeof value === 'string' && value !== '' ? value : null
  }

  return { displayName: input.displayName, ...optional } as {
    displayName: string
  } & Record<(typeof OPTIONAL_CONTACT_FIELDS)[number], string | null>
}

async function assertNameFree(ctx: OrgContext, side: Side, name: string, selfId?: string) {
  const existing =
    side === 'customer'
      ? await db.customer.findUnique({
          where: { orgId_displayName: { orgId: ctx.orgId, displayName: name } },
          select: { id: true },
        })
      : await db.vendor.findUnique({
          where: { orgId_displayName: { orgId: ctx.orgId, displayName: name } },
          select: { id: true },
        })

  if (existing && existing.id !== selfId) {
    throw conflict(
      `Another ${side} is already called "${name}". Two identical names on an aging report help nobody.`,
    )
  }
}

async function assertExpenseAccount(ctx: OrgContext, accountId: string | null) {
  if (!accountId) return
  const account = await db.ledgerAccount.findFirst({
    where: { id: accountId, orgId: ctx.orgId },
    select: { type: true, name: true },
  })
  if (!account) throw notFound('Account')
  if (account.type !== 'EXPENSE' && account.type !== 'ASSET') {
    throw validation(
      `"${account.name}" is not an expense or asset account, so a bill cannot be categorised to it by default.`,
      { defaultExpenseAccountId: ['Choose an expense or asset account'] },
    )
  }
}
