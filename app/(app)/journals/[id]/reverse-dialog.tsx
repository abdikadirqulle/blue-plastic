'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, Undo2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DateField } from '@/components/ui/date-field'
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
    <Dialog open onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reverse {journalNumber}</DialogTitle>
        </DialogHeader>
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
            <DateField id="reverse-date" value={date} onChange={setDate} />
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
      </DialogContent>
    </Dialog>
  )
}
