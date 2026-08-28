'use client'

import { useFormStatus } from 'react-dom'
import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
