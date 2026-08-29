'use client'

import { useFormStatus } from 'react-dom'
import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * A submit button that disables itself while the form is submitting.
 *
 * The order of the props matters and is the whole point: `disabled` is written
 * *after* the spread. Written before it, the caller's own `disabled` — usually
 * undefined — overwrites the computed one, the button stays live through the
 * whole round trip, and a second click posts the document a second time.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()

  return (
    <Button {...props} type="submit" disabled={pending || props.disabled}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
