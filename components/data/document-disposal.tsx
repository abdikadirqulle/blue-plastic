'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, Trash2Icon, XCircleIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Disposition } from '@/lib/document-disposition'
import { deleteDocument, voidDocument, voidPayment } from '@/app/(app)/sales/actions'
import { deletePurchase, voidBillPayment, voidPurchase } from '@/app/(app)/purchases/actions'
import { voidDeposit, voidTransfer } from '@/app/(app)/banking/actions'
import { voidAdjustment } from '@/app/(app)/inventory/actions'

/**
 * One control for getting rid of a transaction, wherever it lives.
 *
 * Every transaction type in the system now answers "delete this" the same way,
 * and the answer is decided by the record rather than by the screen: a draft is
 * deleted, a posted document is voided, a settled one says why it cannot be
 * either. Before this, sales and purchases could be voided from their own pages
 * and nothing else could be undone at all — a bank transfer entered twice, or a
 * stock count against the wrong item, simply stayed in the books.
 *
 * The wording is not softened. "Delete" removes the record; "Void" reverses the
 * entry and keeps it. Which one the button says is which one it does.
 */
export type DisposalKind =
  | 'sales'
  | 'purchase'
  | 'customer-payment'
  | 'bill-payment'
  | 'transfer'
  | 'deposit'
  | 'inventory-adjustment'

const VOID: Record<DisposalKind, (input: { id: string; reason: string }) => Promise<unknown>> = {
  sales: voidDocument,
  purchase: voidPurchase,
  'customer-payment': voidPayment,
  'bill-payment': voidBillPayment,
  transfer: voidTransfer,
  deposit: voidDeposit,
  'inventory-adjustment': voidAdjustment,
}

/** Only documents that can exist unposted have anything to delete. */
const DELETE: Partial<Record<DisposalKind, (input: { id: string }) => Promise<unknown>>> = {
  sales: deleteDocument,
  purchase: deletePurchase,
}

type Result = { ok: true } | { ok: false; error: { message: string } }

export function DisposeButton({
  kind,
  id,
  number,
  disposition,
  redirectTo,
  size = 'sm',
  variant = 'outline',
}: {
  kind: DisposalKind
  id: string
  number: string
  disposition: Disposition
  /** Where to go once the record is gone. Stays put when omitted. */
  redirectTo?: string
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const deleting = disposition.action === 'delete'
  const blocked = disposition.action === 'blocked'

  if (blocked) {
    return (
      <Button variant={variant} size={size} disabled title={disposition.reason}>
        <XCircleIcon /> Void
      </Button>
    )
  }

  if (!open) {
    return (
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {deleting ? <Trash2Icon /> : <XCircleIcon />}
        {deleting ? 'Delete' : 'Void'}
      </Button>
    )
  }

  const run = () =>
    startTransition(async () => {
      setError(null)

      const call = deleting
        ? DELETE[kind]
        : ((input: { id: string }) => VOID[kind]({ ...input, reason: reason.trim() }))
      if (!call) {
        setError('This record cannot be removed from here.')
        return
      }

      const result = (await call({ id })) as Result

      if (result.ok) {
        toast.success(deleting ? `${number} deleted.` : `${number} voided.`)
        setOpen(false)
        if (redirectTo) router.push(redirectTo)
        router.refresh()
      } else {
        setError(result.error.message)
      }
    })

  return (
    <Dialog open onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {deleting ? 'Delete' : 'Void'} {number}
          </DialogTitle>
        </DialogHeader>

        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          {deleting
            ? 'Nothing has been posted for this one, so it can simply go. It will not appear anywhere again, and the number it used is not reissued.'
            : 'The entry is reversed and both stay in the ledger. Any stock it moved comes back. The document is kept — a missing number is a question nobody can answer later, and a voided one answers it.'}
        </p>

        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {deleting ? null : (
          <Field name="dispose-reason" label="Reason" required>
            <Input
              id="dispose-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Entered in error"
              autoFocus
            />
          </Field>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || (!deleting && reason.trim() === '')}
            onClick={run}
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {deleting ? 'Delete' : 'Void'} {number}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
