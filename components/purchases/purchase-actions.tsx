'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck2Icon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { convertOrder, voidPurchase } from '@/app/(app)/purchases/actions'

export function VoidPurchaseButton({ id, number }: { id: string; number: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <XCircleIcon /> Void
      </Button>
    )
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Void {number}</DialogTitle>
        </DialogHeader>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          The entry is reversed and both stay in the ledger. The document is kept.
        </p>

        {error ? (
          <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Field name="void-reason" label="Reason" required>
          <Input
            id="void-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Entered in error"
            autoFocus
          />
        </Field>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || reason.trim() === ''}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await voidPurchase({ id, reason })
                if (result.ok) {
                  toast.success(`${number} voided.`)
                  setOpen(false)
                  router.refresh()
                } else {
                  setError(result.error.message)
                }
              })
            }
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Void {number}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ReceiveOrderButton({
  id,
  number,
  today,
}: {
  id: string
  number: string
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await convertOrder({ id, date: today })
          if (result.ok) {
            toast.success(`${number} became bill ${result.data.number}.`)
            router.push(`/purchases/bills/${result.data.id}`)
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <FileCheck2Icon />}
      Receive and bill
    </Button>
  )
}
