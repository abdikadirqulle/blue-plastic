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
import { Input } from '@/components/ui/input'
import { savePaymentTermForm } from '../tax/actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

export function PaymentTermButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> New term
      </Button>
      {open ? <PaymentTermDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function PaymentTermDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [state, formAction] = useActionState(savePaymentTermForm, idleState)
  const [type, setType] = useState('NET_DAYS')
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-base font-semibold">New payment term</h2>

        <form action={formAction} className="mt-4 space-y-4">
          <FormError message={state.message} />

          <Field name="name" label="Name" required error={e?.name}>
            <Input {...fieldProps('name', e?.name)} placeholder="Net 45" autoFocus required />
          </Field>

          <Field name="type" label="Type" required error={e?.type}>
            <select
              {...fieldProps('type', e?.type)}
              value={type}
              onChange={(event) => setType(event.target.value)}
              className={selectClass}
            >
              <option value="DUE_ON_RECEIPT">Due on receipt</option>
              <option value="NET_DAYS">A number of days after the document date</option>
              <option value="DAY_OF_MONTH">A fixed day of the month</option>
            </select>
          </Field>

          {type !== 'DUE_ON_RECEIPT' ? (
            <Field
              name="dueDays"
              label={type === 'NET_DAYS' ? 'Days' : 'Day of the month'}
              hint={type === 'DAY_OF_MONTH' ? 'Clamped to a day the month actually has.' : undefined}
              required
              error={e?.dueDays}
            >
              <Input
                {...fieldProps('dueDays', e?.dueDays, type === 'DAY_OF_MONTH')}
                type="number"
                min={type === 'DAY_OF_MONTH' ? 1 : 0}
                max={type === 'DAY_OF_MONTH' ? 31 : 365}
                defaultValue={type === 'NET_DAYS' ? 30 : 15}
                className="tabular"
                required
              />
            </Field>
          ) : (
            <input type="hidden" name="dueDays" value="0" />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="discountPercent" label="Early settlement discount (%)" error={e?.discountPercent}>
              <Input {...fieldProps('discountPercent', e?.discountPercent)} inputMode="decimal" className="tabular" />
            </Field>
            <Field name="discountDays" label="If paid within (days)" error={e?.discountDays}>
              <Input {...fieldProps('discountDays', e?.discountDays)} type="number" min={0} max={365} className="tabular" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" value="true" className="size-4 rounded border-input" />
            Make this the default for new customers and vendors
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Create term</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}
