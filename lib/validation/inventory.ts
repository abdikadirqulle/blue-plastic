import { z } from 'zod'

import { calendarDate, cuid, optionalText, requiredText } from './common'

const quantity = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,4})?$/, 'Enter a quantity')

export const inventoryAdjustmentSchema = z.object({
  date: calendarDate,
  /** Blank means Inventory Shrinkage, which is where a difference normally goes. */
  accountId: z
    .union([cuid, z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  reason: optionalText(300),
  memo: optionalText(1000),
  lines: z
    .array(
      z.object({
        itemId: cuid,
        countedQuantity: quantity,
        /** Only used when stock is being added and its cost is known. */
        unitCost: z
          .union([z.string().trim().regex(/^\d{1,15}(\.\d{1,6})?$/), z.literal('')])
          .transform((v) => (v === '' ? null : v))
          .nullable()
          .optional(),
        description: optionalText(300),
      }),
    )
    .min(1, 'Add at least one item')
    .max(500),
})

export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>

export const negativeStockSchema = z.object({
  allowNegativeStock: z.coerce.boolean(),
})

export const voidAdjustmentSchema = z.object({ id: cuid, reason: requiredText('Reason', 300) })
