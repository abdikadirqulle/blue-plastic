import type { ActionResult } from '@/server/action'

/**
 * The shape every form in the app keeps in `useActionState`. Server Actions
 * return `ActionResult`; this adapts it to something a form can render, so there
 * is one form idiom in the codebase rather than one per page.
 */
export type FormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

export const idleState: FormState = { status: 'idle' }

export function toFormState(result: ActionResult<unknown>, successMessage: string): FormState {
  if (result.ok) return { status: 'success', message: successMessage }
  return {
    status: 'error',
    // Field-level errors are shown against their fields; only show a banner for
    // failures that belong to the form as a whole.
    message: result.error.details ? undefined : result.error.message,
    fieldErrors: result.error.details,
  }
}

/** Read a `FormData` into a plain object, dropping empty file inputs. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value
  }
  return values
}
