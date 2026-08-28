'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ACCOUNT_SUBTYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  SUBTYPES_BY_TYPE,
} from '@/lib/accounting-labels'
import type { AccountType } from '@prisma/client'
import { createAccountForm, updateAccountForm } from './actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50'

export type AccountFormValues = {
  id: string
  code: string
  name: string
  description: string | null
  type: AccountType
  parentId: string | null
  isSystem: boolean
}

export type ParentOption = { id: string; code: string; name: string; type: AccountType }

export function NewAccountButton({
  parents,
  today,
  currency,
}: {
  parents: ParentOption[]
  today: string
  currency: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> New account
      </Button>
      {open ? (
        <AccountDialog
          mode="create"
          parents={parents}
          today={today}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

export function EditAccountDialog({
  account,
  parents,
  onClose,
}: {
  account: AccountFormValues
  parents: ParentOption[]
  onClose: () => void
}) {
  return <AccountDialog mode="edit" account={account} parents={parents} onClose={onClose} />
}

function AccountDialog({
  mode,
  account,
  parents,
  today,
  currency,
  onClose,
}: {
  mode: 'create' | 'edit'
  account?: AccountFormValues
  parents: ParentOption[]
  today?: string
  currency?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    mode === 'create' ? createAccountForm : updateAccountForm,
    idleState,
  )
  const [type, setType] = useState<AccountType>(account?.type ?? 'EXPENSE')
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

  const eligibleParents = useMemo(
    () => parents.filter((parent) => parent.type === type && parent.id !== account?.id),
    [parents, type, account?.id],
  )

  const e = state.fieldErrors

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <button type="button" aria-label="Cancel" className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        className="relative my-8 w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg"
      >
        <h2 id="account-dialog-title" className="text-base font-semibold">
          {mode === 'create' ? 'New account' : `Edit ${account?.code} ${account?.name}`}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          {mode === 'create'
            ? 'Account numbers order the chart: 1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000s cost of sales, 6000s expenses.'
            : 'Type and subtype are fixed once an account exists — changing them would reclassify every figure already posted to it.'}
        </p>

        <form action={formAction} className="space-y-4">
          <FormError message={state.message} />
          {account ? <input type="hidden" name="id" value={account.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <Field name="code" label="Number" required error={e?.code}>
              <Input
                {...fieldProps('code', e?.code)}
                defaultValue={account?.code}
                inputMode="numeric"
                placeholder="6100"
                required
              />
            </Field>

            <Field name="name" label="Name" required error={e?.name}>
              <Input {...fieldProps('name', e?.name)} defaultValue={account?.name} autoFocus required />
            </Field>
          </div>

          {mode === 'create' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="type" label="Type" required error={e?.type}>
                <select
                  {...fieldProps('type', e?.type)}
                  value={type}
                  onChange={(event) => setType(event.target.value as AccountType)}
                  className={selectClass}
                >
                  {ACCOUNT_TYPE_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {ACCOUNT_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field name="subtype" label="Detail type" required error={e?.subtype}>
                <select {...fieldProps('subtype', e?.subtype)} className={selectClass}>
                  {SUBTYPES_BY_TYPE[type].map((value) => (
                    <option key={value} value={value}>
                      {ACCOUNT_SUBTYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          <Field
            name="parentId"
            label="Sub-account of"
            hint="Optional. A parent becomes a grouping heading and stops accepting postings of its own."
            error={e?.parentId}
          >
            <select
              {...fieldProps('parentId', e?.parentId, true)}
              defaultValue={account?.parentId ?? ''}
              className={selectClass}
            >
              <option value="">— none —</option>
              {eligibleParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.code} {parent.name}
                </option>
              ))}
            </select>
          </Field>

          <Field name="description" label="Description" error={e?.description}>
            <Input {...fieldProps('description', e?.description)} defaultValue={account?.description ?? ''} />
          </Field>

          {mode === 'create' ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                An opening balance posts a journal against Opening Balance Equity — it is never written
                onto the account directly. Leave it blank for a new account with no history.
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
              {mode === 'create' ? 'Create account' : 'Save changes'}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}
