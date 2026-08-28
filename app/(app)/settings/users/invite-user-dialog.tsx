'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { UserPlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles'
import { inviteUserForm } from './actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

export function InviteUserDialog({ roles }: { roles: string[] }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState(roles[0] ?? 'VIEWER')
  const [state, formAction] = useActionState(inviteUserForm, idleState)
  const closeRef = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !closeRef.current) {
      closeRef.current = true
      toast.success(state.message ?? 'Member added.')
      setOpen(false)
    }
    if (state.status !== 'success') closeRef.current = false
  }, [state])

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlusIcon /> Add member
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-lg"
      >
        <h2 id="invite-title" className="text-base font-semibold">
          Add a member
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          They can sign in immediately with the password you set here. Ask them to change it.
        </p>

        <form action={formAction} className="space-y-4">
          <FormError message={state.message} />

          <Field name="name" label="Name" required error={state.fieldErrors?.name}>
            <Input {...fieldProps('name', state.fieldErrors?.name)} autoFocus required />
          </Field>

          <Field name="email" label="Email" required error={state.fieldErrors?.email}>
            <Input {...fieldProps('email', state.fieldErrors?.email)} type="email" required />
          </Field>

          <Field
            name="role"
            label="Role"
            hint={ROLE_DESCRIPTIONS[role as keyof typeof ROLE_DESCRIPTIONS]}
            required
            error={state.fieldErrors?.role}
          >
            <select
              {...fieldProps('role', state.fieldErrors?.role, true)}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={selectClass}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            name="temporaryPassword"
            label="Temporary password"
            hint="At least 12 characters."
            required
            error={state.fieldErrors?.temporaryPassword}
          >
            <Input
              {...fieldProps('temporaryPassword', state.fieldErrors?.temporaryPassword, true)}
              type="text"
              autoComplete="off"
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add member</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}
