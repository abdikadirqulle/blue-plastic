import { CheckCircle2Icon } from 'lucide-react'

import { FormError } from './form-error'
import type { FormState } from './action-state'

export function FormStatus({ state }: { state: FormState }) {
  if (state.status === 'error') return <FormError message={state.message} />

  if (state.status === 'success' && state.message) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-success/30 bg-success/8 px-3 py-2 text-sm text-success"
      >
        <CheckCircle2Icon className="size-4 shrink-0" />
        <span>{state.message}</span>
      </div>
    )
  }

  return null
}
