'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, Undo2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reverseJournalAction } from '../actions'

export function ReverseDialog({
  journalId,
  journalNumber,
  defaultDate,
}: {
  journalId: string
  journalNumber: string
  defaultDate: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await reverseJournalAction({ journalId, reason, date })
      if (result.ok) {
        toast.success(`Reversed by ${result.data.journalNumber}.`)
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error.message)
      }
    })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2Icon /> Reverse
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reverse-title"
        className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-lg"
      >
        <h2 id="reverse-title" className="text-base font-semibold">
          Reverse {journalNumber}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          This posts a mirror-image entry. Both stay in the ledger and cancel out — nothing is erased,
          and the original remains readable exactly as it was.
        </p>

        {error ? (
          <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-4">
          <Field name="reverse-reason" label="Reason" required>
            <Input
              id="reverse-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Duplicate entry"
              autoFocus
            />
          </Field>

          <Field
            name="reverse-date"
            label="Date of reversal"
            hint="If this period is closed, the reversal moves to the first open one."
          >
            <Input
              id="reverse-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || reason.trim() === ''}>
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Post reversal
          </Button>
        </div>
      </div>
    </div>
  )
}
