import { AlertCircleIcon } from 'lucide-react'

/** Form-level failure: a message that is not attributable to one field. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
