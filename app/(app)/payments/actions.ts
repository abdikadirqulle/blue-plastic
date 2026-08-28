'use server'

import { z } from 'zod'

import { cuid } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import * as paymentService from '@/server/services/payment.service'

/**
 * The payment form asks which invoices are outstanding once a customer is
 * chosen. A server action rather than a route handler: it is a one-shot lookup
 * for a form, not a cacheable resource.
 */
export async function openInvoicesForCustomer(customerId: string) {
  const ctx = await requireOrgContext('payment:create')
  const parsed = z.object({ customerId: cuid }).safeParse({ customerId })
  if (!parsed.success) return []

  const invoices = await paymentService.openInvoicesFor(ctx, parsed.data.customerId)
  return invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    date: invoice.date.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    balance: invoice.balance,
  }))
}
