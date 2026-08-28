'use server'

import { revalidatePath } from 'next/cache'
import type { PurchaseDocumentType } from '@prisma/client'
import { z } from 'zod'

import { toFormState, type FormState } from '@/components/forms/action-state'
import { cuid } from '@/lib/validation/common'
import {
  applyVendorCreditSchema,
  billPaymentSchema,
  convertOrderSchema,
  purchaseDocumentSchema,
  voidPurchaseSchema,
} from '@/lib/validation/purchases'
import { requireOrgContext } from '@/server/auth/context'
import { action } from '@/server/action'
import * as billPaymentService from '@/server/services/bill-payment.service'
import * as purchaseService from '@/server/services/purchase.service'

function revalidatePurchases() {
  for (const slug of ['bills', 'expenses', 'vendor-credits', 'purchase-orders']) {
    revalidatePath(`/purchases/${slug}`)
  }
  revalidatePath('/bill-payments')
  revalidatePath('/vendors')
  revalidatePath('/reports/ap-aging')
  revalidatePath('/reports/trial-balance')
  revalidatePath('/accounts')
}

const documentType = z.enum(['BILL', 'EXPENSE', 'VENDOR_CREDIT', 'PURCHASE_ORDER'])

export const createPurchase = action
  .requires('bill:create')
  .input(purchaseDocumentSchema.safeExtend({ type: documentType }))
  .handler(async (ctx, input) => {
    const { type, ...rest } = input
    const document = await purchaseService.create(ctx, type as PurchaseDocumentType, rest)
    revalidatePurchases()
    return document
  })

export const updatePurchase = action
  .requires('bill:update')
  .input(purchaseDocumentSchema.safeExtend({ id: cuid }))
  .handler(async (ctx, input) => {
    const { id, ...rest } = input
    const document = await purchaseService.update(ctx, id, rest)
    revalidatePurchases()
    return document
  })

export const voidPurchase = action
  .requires('bill:void')
  .input(voidPurchaseSchema)
  .handler(async (ctx, input) => {
    const document = await purchaseService.voidDocument(ctx, input.id, input.reason)
    revalidatePurchases()
    return document
  })

export const convertOrder = action
  .requires('bill:create')
  .input(convertOrderSchema)
  .handler(async (ctx, input) => {
    const bill = await purchaseService.convertOrder(ctx, input.id, input.date)
    revalidatePurchases()
    return bill
  })

export const createBillPayment = action
  .requires('expense:create')
  .input(billPaymentSchema)
  .handler(async (ctx, input) => {
    const payment = await billPaymentService.create(ctx, input)
    revalidatePurchases()
    return payment
  })

export const applyVendorCredit = action
  .requires('expense:create')
  .input(applyVendorCreditSchema)
  .handler(async (ctx, input) => {
    const credit = await billPaymentService.applyCredit(ctx, input.creditDocumentId, input.applications)
    revalidatePurchases()
    return credit
  })

export const voidBillPayment = action
  .requires('expense:void')
  .input(voidPurchaseSchema)
  .handler(async (ctx, input) => {
    const payment = await billPaymentService.voidPayment(ctx, input.id, input.reason)
    revalidatePurchases()
    return payment
  })

/** Which bills a vendor still has open, for the payment screen. */
export async function openBillsForVendor(vendorId: string) {
  const ctx = await requireOrgContext('expense:create')
  const parsed = z.object({ vendorId: cuid }).safeParse({ vendorId })
  if (!parsed.success) return []

  const bills = await billPaymentService.openBillsFor(ctx, parsed.data.vendorId)
  return bills.map((bill) => ({
    id: bill.id,
    number: bill.number,
    reference: bill.reference,
    date: bill.date.toISOString(),
    dueDate: bill.dueDate?.toISOString() ?? null,
    balance: bill.balance,
  }))
}

/* --- Form adapters -------------------------------------------------------- */

export async function savePurchaseForm(_prev: FormState, formData: FormData): Promise<FormState> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { status: 'error', message: 'The document could not be read. Please try again.' }
  }

  const result = parsed.id ? await updatePurchase(parsed) : await createPurchase(parsed)
  return toFormState(
    result,
    result.ok && 'number' in result.data ? `${result.data.number} saved.` : 'Saved.',
  )
}

export async function saveBillPaymentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { status: 'error', message: 'The payment could not be read. Please try again.' }
  }

  const result = await createBillPayment(parsed)
  return toFormState(
    result,
    result.ok && 'number' in result.data ? `Payment ${result.data.number} recorded.` : 'Recorded.',
  )
}
