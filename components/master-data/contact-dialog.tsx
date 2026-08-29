'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import {
  createCustomerForm,
  createVendorForm,
  updateCustomerForm,
  updateVendorForm,
} from '@/app/(app)/customers/actions'

export type ContactSide = 'customer' | 'vendor'

export type ContactValues = {
  id?: string
  displayName?: string | null
  companyName?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  taxRegistrationNumber?: string | null
  billingLine1?: string | null
  billingLine2?: string | null
  billingCity?: string | null
  billingRegion?: string | null
  billingPostalCode?: string | null
  billingCountry?: string | null
  shippingLine1?: string | null
  shippingCity?: string | null
  shippingPostalCode?: string | null
  paymentTermId?: string | null
  creditLimit?: string | null
  defaultExpenseAccountId?: string | null
  notes?: string | null
}

export type Option = { id: string; label: string }

export function NewContactButton(props: {
  side: ContactSide
  terms: Option[]
  expenseAccounts?: Option[]
  today: string
  currency: string
}) {
  const [open, setOpen] = useState(false)
  const label = props.side === 'customer' ? 'New customer' : 'New vendor'

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> {label}
      </Button>
      {open ? <ContactDialog {...props} mode="create" onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export function ContactDialog({
  side,
  mode,
  contact,
  terms,
  expenseAccounts = [],
  today,
  currency,
  onClose,
}: {
  side: ContactSide
  mode: 'create' | 'edit'
  contact?: ContactValues
  terms: Option[]
  expenseAccounts?: Option[]
  today: string
  currency: string
  onClose: () => void
}) {
  const router = useRouter()
  const formAction =
    side === 'customer'
      ? mode === 'create'
        ? createCustomerForm
        : updateCustomerForm
      : mode === 'create'
        ? createVendorForm
        : updateVendorForm

  const [state, submit] = useActionState(formAction, idleState)
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Saved.')
      router.refresh()
      onClose()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router, onClose])

  const e = state.fieldErrors
  const noun = side === 'customer' ? 'customer' : 'vendor'

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? `New ${noun}` : `Edit ${contact?.displayName}`}</DialogTitle>
        </DialogHeader>

        <form action={submit} className="mt-4 space-y-5">
          <FormError message={state.message} />
          {contact?.id ? <input type="hidden" name="id" value={contact.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="displayName"
              label="Display name"
              hint="How they appear on documents and on the aging report."
              required
              error={e?.displayName}
            >
              <Input
                {...fieldProps('displayName', e?.displayName, true)}
                defaultValue={contact?.displayName ?? ''}
                autoFocus
                required
              />
            </Field>
            <Field name="companyName" label="Company name" error={e?.companyName}>
              <Input {...fieldProps('companyName', e?.companyName)} defaultValue={contact?.companyName ?? ''} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="firstName" label="First name" error={e?.firstName}>
              <Input {...fieldProps('firstName', e?.firstName)} defaultValue={contact?.firstName ?? ''} />
            </Field>
            <Field name="lastName" label="Last name" error={e?.lastName}>
              <Input {...fieldProps('lastName', e?.lastName)} defaultValue={contact?.lastName ?? ''} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="email" label="Email" error={e?.email}>
              <Input {...fieldProps('email', e?.email)} type="email" defaultValue={contact?.email ?? ''} />
            </Field>
            <Field name="phone" label="Phone" error={e?.phone}>
              <Input {...fieldProps('phone', e?.phone)} defaultValue={contact?.phone ?? ''} />
            </Field>
            <Field name="mobile" label="Mobile" error={e?.mobile}>
              <Input {...fieldProps('mobile', e?.mobile)} defaultValue={contact?.mobile ?? ''} />
            </Field>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Billing address
            </p>
            <Field name="billingLine1" label="Address" error={e?.billingLine1}>
              <Input {...fieldProps('billingLine1', e?.billingLine1)} defaultValue={contact?.billingLine1 ?? ''} />
            </Field>
            <Field name="billingLine2" label="Address line 2" error={e?.billingLine2}>
              <Input {...fieldProps('billingLine2', e?.billingLine2)} defaultValue={contact?.billingLine2 ?? ''} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field name="billingCity" label="City" error={e?.billingCity}>
                <Input {...fieldProps('billingCity', e?.billingCity)} defaultValue={contact?.billingCity ?? ''} />
              </Field>
              <Field name="billingRegion" label="State" error={e?.billingRegion}>
                <Input {...fieldProps('billingRegion', e?.billingRegion)} defaultValue={contact?.billingRegion ?? ''} />
              </Field>
              <Field name="billingPostalCode" label="Postal code" error={e?.billingPostalCode}>
                <Input
                  {...fieldProps('billingPostalCode', e?.billingPostalCode)}
                  defaultValue={contact?.billingPostalCode ?? ''}
                />
              </Field>
              <Field name="billingCountry" label="Country" hint="Two letters" error={e?.billingCountry}>
                <Input
                  {...fieldProps('billingCountry', e?.billingCountry, true)}
                  defaultValue={contact?.billingCountry ?? ''}
                  maxLength={2}
                  className="uppercase"
                />
              </Field>
            </div>
          </div>

          {side === 'customer' ? (
            <>
              <Separator />
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Shipping address
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field name="shippingLine1" label="Address" error={e?.shippingLine1}>
                    <Input
                      {...fieldProps('shippingLine1', e?.shippingLine1)}
                      defaultValue={contact?.shippingLine1 ?? ''}
                    />
                  </Field>
                  <Field name="shippingCity" label="City" error={e?.shippingCity}>
                    <Input {...fieldProps('shippingCity', e?.shippingCity)} defaultValue={contact?.shippingCity ?? ''} />
                  </Field>
                  <Field name="shippingPostalCode" label="Postal code" error={e?.shippingPostalCode}>
                    <Input
                      {...fieldProps('shippingPostalCode', e?.shippingPostalCode)}
                      defaultValue={contact?.shippingPostalCode ?? ''}
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="paymentTermId" label="Payment terms" error={e?.paymentTermId}>
              <NativeSelect
                {...fieldProps('paymentTermId', e?.paymentTermId)}
                defaultValue={contact?.paymentTermId ?? ''}
              >
                <option value="">— none —</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field name="taxRegistrationNumber" label="Tax registration number" error={e?.taxRegistrationNumber}>
              <Input
                {...fieldProps('taxRegistrationNumber', e?.taxRegistrationNumber)}
                defaultValue={contact?.taxRegistrationNumber ?? ''}
              />
            </Field>
          </div>

          {side === 'customer' ? (
            <Field
              name="creditLimit"
              label={`Credit limit (${currency})`}
              hint="Recorded now; invoicing warns against it in a later phase."
              error={e?.creditLimit}
            >
              <Input
                {...fieldProps('creditLimit', e?.creditLimit, true)}
                inputMode="decimal"
                className="tabular"
                defaultValue={contact?.creditLimit ?? ''}
              />
            </Field>
          ) : (
            <Field
              name="defaultExpenseAccountId"
              label="Default expense account"
              hint="Pre-selected on a bill, so routine spending is categorised the same way every time."
              error={e?.defaultExpenseAccountId}
            >
              <NativeSelect
                {...fieldProps('defaultExpenseAccountId', e?.defaultExpenseAccountId, true)}
                defaultValue={contact?.defaultExpenseAccountId ?? ''}
              >
                <option value="">— none —</option>
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field name="notes" label="Notes" error={e?.notes}>
            <Input {...fieldProps('notes', e?.notes)} defaultValue={contact?.notes ?? ''} />
          </Field>

          {mode === 'create' ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                {side === 'customer'
                  ? 'What this customer already owed when the books started. It posts to Accounts Receivable against Opening Balance Equity, so it appears on the aging report and in the control account — never as a number written onto the customer.'
                  : 'What was already owed to this vendor when the books started. It posts to Accounts Payable against Opening Balance Equity.'}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="openingBalance" label={`Opening balance (${currency})`} error={e?.openingBalance}>
                  <Input
                    {...fieldProps('openingBalance', e?.openingBalance)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="tabular"
                  />
                </Field>
                <Field name="openingBalanceDate" label="As at" error={e?.openingBalanceDate}>
                  <Input
                    {...fieldProps('openingBalanceDate', e?.openingBalanceDate)}
                    type="date"
                    defaultValue={today}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">
              {mode === 'create' ? `Create ${noun}` : 'Save changes'}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
