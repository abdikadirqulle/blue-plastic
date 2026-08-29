'use server'

import { revalidatePath } from 'next/cache'

import { toFormState, type FormState } from '@/components/forms/action-state'
import { inventoryAdjustmentSchema, negativeStockSchema } from '@/lib/validation/inventory'
import { action } from '@/server/action'
import { requestMeta, writeAudit } from '@/server/audit'
import { db } from '@/server/db'
import * as inventoryService from '@/server/services/inventory.service'

export const createAdjustment = action
  .requires('inventory:adjust')
  .input(inventoryAdjustmentSchema)
  .handler(async (ctx, input) => {
    const adjustment = await inventoryService.createAdjustment(ctx, input)
    revalidatePath('/inventory')
    revalidatePath('/accounts')
    revalidatePath('/reports/trial-balance')
    return adjustment
  })

export const setNegativeStockPolicy = action
  .requires('org:update')
  .input(negativeStockSchema)
  .handler(async (ctx, input) => {
    const meta = await requestMeta()

    await db.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: ctx.orgId },
        data: { allowNegativeStock: input.allowNegativeStock },
      })
      await writeAudit(
        tx,
        ctx,
        {
          entity: 'Organization',
          entityId: ctx.orgId,
          action: 'UPDATE',
          after: { allowNegativeStock: input.allowNegativeStock },
        },
        meta,
      )
    })

    revalidatePath('/inventory')
    revalidatePath('/settings/organization')
    return { allowNegativeStock: input.allowNegativeStock }
  })

export async function saveAdjustmentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { status: 'error', message: 'The adjustment could not be read. Please try again.' }
  }

  const result = await createAdjustment(parsed)
  return toFormState(
    result,
    result.ok && 'number' in result.data ? `${result.data.number} posted.` : 'Posted.',
  )
}
