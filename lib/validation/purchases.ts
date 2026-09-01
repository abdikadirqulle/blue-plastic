import { z } from 'zod'

import { calendarDate, cuid, moneyString, optionalText } from './common'

const optionalId = z
  .union([cuid, z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

const optionalDate = z
  .union([calendarDate, z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const purchaseLineSchema = z.object({
  itemId: optionalId,
  /** Where the cost lands. Required unless an item supplies one. */
  expenseAccountId: optionalId,
  description: optionalText(1000),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,4})?$/, 'Enter a quantity')
    .refine((v) => Number(v) > 0, 'Quantity must be more than zero')
    .default('1'),
  unitPrice: z.union([z.string().trim().regex(/^\d{1,15}(\.\d{1,4})?$/, 'Enter an amount'), z.literal('')]).default(''),
  discountPercent: z
    .union([
      z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/).refine((v) => Number(v) <= 100, 'At most 100%'),
      z.literal(''),
    ])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  taxCodeId: optionalId,
})

export const purchaseDocumentSchema = z.object({
  vendorId: cuid,
  date: calendarDate,
  paymentTermId: optionalId,
  expiryDate: optionalDate,
  reference: optionalText(60),
  memo: optionalText(1000),
  paymentAccountId: optionalId,
  saveAsDraft: z.coerce.boolean().default(false),
  lines: z.array(purchaseLineSchema).min(1, 'Add at least one line').max(200),
})

export type PurchaseDocumentInput = z.infer<typeof purchaseDocumentSchema>

export const convertOrderSchema = z.object({ id: cuid, date: calendarDate })

export const billPaymentSchema = z.object({
  vendorId: cuid,
  date: calendarDate,
  amount: moneyString.refine((v) => Number(v) > 0, 'Enter an amount greater than zero'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER']),
  paymentAccountId: cuid,
  reference: optionalText(60),
  memo: optionalText(500),
  applications: z.array(z.object({ billId: cuid, amount: moneyString })).max(200).default([]),
})

export type BillPaymentInput = z.infer<typeof billPaymentSchema>

export const applyVendorCreditSchema = z.object({
  creditDocumentId: cuid,
  applications: z.array(z.object({ billId: cuid, amount: moneyString })).min(1).max(200),
})

/* --- Receiving ------------------------------------------------------------ */

/**
 * A goods receipt against a purchase order: how much of each line arrived.
 *
 * Quantities are strings, like every other quantity in the system, so a decimal
 * survives the round trip without going through a float.
 */
export const receiveOrderSchema = z.object({
  orderId: cuid,
  date: calendarDate,
  reference: optionalText(100),
  memo: optionalText(500),
  lines: z
    .array(
      z.object({
        lineId: cuid,
        /** Blank and "0" both mean "none of this line arrived". */
        quantity: z
          .string()
          .trim()
          .regex(/^\d{0,12}(\.\d{1,4})?$/, 'Enter a quantity')
          .transform((value) => (value === '' || value === '.' ? '0' : value)),
      }),
    )
    .min(1, 'Enter a quantity against at least one line')
    .max(200),
})

export type ReceiveOrderInput = z.infer<typeof receiveOrderSchema>
