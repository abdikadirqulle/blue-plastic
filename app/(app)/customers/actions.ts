'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { formValues, toFormState, type FormState } from '@/components/forms/action-state'
import {
  bulkSetActiveSchema,
  csvImportSchema,
  customerSchema,
  vendorSchema,
} from '@/lib/validation/master-data'
import { cuid } from '@/lib/validation/common'
import { action } from '@/server/action'
import * as contactService from '@/server/services/contact.service'
import { importContacts } from '@/server/services/import.service'

function revalidateContacts() {
  revalidatePath('/customers')
  revalidatePath('/vendors')
  revalidatePath('/accounts')
  revalidatePath('/reports/trial-balance')
}

/* --- Customers ------------------------------------------------------------ */

export const createCustomer = action
  .requires('customer:create')
  .input(customerSchema)
  .handler(async (ctx, input) => {
    const customer = await contactService.createCustomer(ctx, input)
    revalidateContacts()
    return { id: customer.id }
  })

export const updateCustomer = action
  .requires('customer:update')
  .input(customerSchema.extend({ id: cuid }))
  .handler(async (ctx, input) => {
    const customer = await contactService.updateCustomer(ctx, input)
    revalidateContacts()
    revalidatePath(`/customers/${input.id}`)
    return { id: customer.id }
  })

export const setCustomersActive = action
  .requires('customer:archive')
  .input(bulkSetActiveSchema)
  .handler(async (ctx, input) => {
    const result = await contactService.setActive(ctx, 'customer', input.ids, input.isActive)
    revalidateContacts()
    return result
  })

/* --- Vendors -------------------------------------------------------------- */

export const createVendor = action
  .requires('vendor:create')
  .input(vendorSchema)
  .handler(async (ctx, input) => {
    const vendor = await contactService.createVendor(ctx, input)
    revalidateContacts()
    return { id: vendor.id }
  })

export const updateVendor = action
  .requires('vendor:update')
  .input(vendorSchema.extend({ id: cuid }))
  .handler(async (ctx, input) => {
    const vendor = await contactService.updateVendor(ctx, input)
    revalidateContacts()
    revalidatePath(`/vendors/${input.id}`)
    return { id: vendor.id }
  })

export const setVendorsActive = action
  .requires('vendor:archive')
  .input(bulkSetActiveSchema)
  .handler(async (ctx, input) => {
    const result = await contactService.setActive(ctx, 'vendor', input.ids, input.isActive)
    revalidateContacts()
    return result
  })

/* --- Import --------------------------------------------------------------- */

export const previewImport = action
  .requires('customer:create')
  .input(csvImportSchema.extend({ side: z.enum(['customer', 'vendor']) }))
  .handler((ctx, input) => importContacts(ctx, input.side, input.csv, { dryRun: true }))

export const runImport = action
  .requires('customer:create')
  .input(csvImportSchema.extend({ side: z.enum(['customer', 'vendor']) }))
  .handler(async (ctx, input) => {
    const result = await importContacts(ctx, input.side, input.csv)
    revalidateContacts()
    return result
  })

/* --- Form adapters -------------------------------------------------------- */

export async function createCustomerForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await createCustomer(formValues(formData)), 'Customer created.')
}

export async function updateCustomerForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await updateCustomer(formValues(formData)), 'Customer saved.')
}

export async function createVendorForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await createVendor(formValues(formData)), 'Vendor created.')
}

export async function updateVendorForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return toFormState(await updateVendor(formValues(formData)), 'Vendor saved.')
}
