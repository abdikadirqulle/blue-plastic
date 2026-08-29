'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { saveTransferForm } from '@/app/(app)/banking/actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

export function TransferForm({
  accounts,
  today,
  currency,
}: {
  accounts: { id: string; label: string }[]
  today: string
  currency: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(saveTransferForm, idleState)
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '')
  const [toAccountId, setTo] = useState(accounts[1]?.id ?? '')
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Recorded.')
      router.push('/banking')
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router])

  const e = state.fieldErrors
  const sameAccount = fromAccountId !== '' && fromAccountId === toAccountId

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-4 p-4">
          <FormError message={state.message} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="fromAccountId" label="From" required error={e?.fromAccountId}>
              <select
                {...fieldProps('fromAccountId', e?.fromAccountId)}
                value={fromAccountId}
                onChange={(event) => setFrom(event.target.value)}
                className={selectClass}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              name="toAccountId"
              label="To"
              required
              error={sameAccount ? ['A transfer to itself moves nothing'] : e?.toAccountId}
            >
              <select
                {...fieldProps('toAccountId', sameAccount ? ['x'] : e?.toAccountId)}
                value={toAccountId}
                onChange={(event) => setTo(event.target.value)}
                className={selectClass}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="date" label="Date" required error={e?.date}>
              <Input {...fieldProps('date', e?.date)} type="date" defaultValue={today} required />
            </Field>
            <Field name="amount" label={`Amount (${currency})`} required error={e?.amount}>
              <Input
                {...fieldProps('amount', e?.amount)}
                inputMode="decimal"
                className="tabular"
                placeholder="0.00"
                required
              />
            </Field>
            <Field name="reference" label="Reference" error={e?.reference}>
              <Input {...fieldProps('reference', e?.reference)} />
            </Field>
          </div>

          <Field name="memo" label="Note" error={e?.memo}>
            <Input {...fieldProps('memo', e?.memo)} />
          </Field>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/banking')}>
          Cancel
        </Button>
        <SubmitButton disabled={sameAccount} pendingLabel="Recording…">
          Record transfer
        </SubmitButton>
      </div>
    </form>
  )
}
