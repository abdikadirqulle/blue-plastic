'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requiredText } from '@/lib/validation/common'
import { customerSchema, itemSchema, vendorSchema } from '@/lib/validation/master-data'
import { action } from '@/server/action'
import * as contactService from '@/server/services/contact.service'
import * as itemService from '@/server/services/item.service'
import { db } from '@/server/db'
import { precondition } from '@/server/errors'

/**
 * Creating a record from inside a form that needs it.
 *
 * A person entering an invoice for a new customer should not have to abandon the
 * invoice, go to the customer screen, fill in a form about billing addresses and
 * payment terms, and come back. These actions create the *minimum* record — a
 * name, and whatever the ledger genuinely requires — and the rest is filled in
 * later, on the screen that exists for it.
 *
 * They are deliberately separate from the full create actions rather than a flag
 * on them: a quick create is a different intent, and the permission it needs is
 * the same, but the shape of what it accepts must not drift towards the full
 * form.
 */
const nameOnly = z.object({ name: requiredText('Name', 160) })

export const quickCreateCustomer = action
  .requires('customer:create')
  .input(nameOnly)
  .handler(async (ctx, input) => {
    // Parsed through the real schema rather than cast into it, so a quick create
    // cannot slip past a rule the full form enforces.
    const customer = await contactService.createCustomer(
      ctx,
      customerSchema.parse({ displayName: input.name }),
    )

    revalidatePath('/customers')
    return { id: customer.id, label: input.name }
  })

export const quickCreateVendor = action
  .requires('vendor:create')
  .input(nameOnly)
  .handler(async (ctx, input) => {
    const vendor = await contactService.createVendor(ctx, vendorSchema.parse({ displayName: input.name }))

    revalidatePath('/vendors')
    return { id: vendor.id, label: input.name }
  })

/**
 * A quick item is a service, sold into the organisation's uncategorised income
 * account. Service rather than inventory because a tracked item needs an
 * inventory account, a cost account and an opening quantity — decisions that
 * belong on the item screen, not in a dropdown on an invoice.
 */
export const quickCreateItem = action
  .requires('item:create')
  .input(nameOnly)
  .handler(async (ctx, input) => {
    const income = await db.ledgerAccount.findFirst({
      where: {
        orgId: ctx.orgId,
        isActive: true,
        type: 'REVENUE',
        // The uncategorised account exists for exactly this: somewhere honest to
        // put revenue until somebody says where it belongs.
        OR: [{ systemKey: 'UNCATEGORISED_INCOME' }, { subtype: 'INCOME' }],
      },
      orderBy: [{ systemKey: 'desc' }, { code: 'asc' }],
      select: { id: true },
    })

    if (!income) {
      throw precondition(
        'There is no income account to sell this into. Add one in the chart of accounts first.',
      )
    }

    const item = await itemService.create(
      ctx,
      itemSchema.parse({ name: input.name, type: 'SERVICE', incomeAccountId: income.id }),
    )

    revalidatePath('/items')
    return { id: item.id, label: input.name }
  })
