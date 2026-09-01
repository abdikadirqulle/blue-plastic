'use server'

import { revalidatePath } from 'next/cache'

import { formValues, toFormState, type FormState } from '@/components/forms/action-state'
import { cuid, deleteRecordSchema } from '@/lib/validation/common'
import { bulkSetActiveSchema, itemSchema } from '@/lib/validation/master-data'
import { action } from '@/server/action'
import * as itemService from '@/server/services/item.service'

export const createItem = action
  .requires('item:create')
  .input(itemSchema)
  .handler(async (ctx, input) => {
    const item = await itemService.create(ctx, input)
    revalidatePath('/items')
    return { id: item.id, name: item.name }
  })

export const updateItem = action
  .requires('item:update')
  .input(itemSchema.safeExtend({ id: cuid }))
  .handler(async (ctx, input) => {
    const item = await itemService.update(ctx, input)
    revalidatePath('/items')
    return { id: item.id }
  })

export const setItemsActive = action
  .requires('item:archive')
  .input(bulkSetActiveSchema)
  .handler(async (ctx, input) => {
    const result = await itemService.setActive(ctx, input.ids, input.isActive)
    revalidatePath('/items')
    return result
  })

/**
 * Delete an item.
 *
 * Guarded by `item:archive` rather than a new permission: whoever may take an
 * item out of circulation may delete one.
 */
export const deleteItem = action
  .requires('item:archive')
  .input(deleteRecordSchema)
  .handler(async (ctx, input) => {
    const result = await itemService.remove(ctx, input.id, input.reason)
    revalidatePath('/items')
    revalidatePath('/inventory')
    revalidatePath('/reports')
    return { id: result.id, number: result.name }
  })

export async function createItemForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await createItem(formValues(formData)), 'Item created.')
}

export async function updateItemForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await updateItem(formValues(formData)), 'Item saved.')
}
