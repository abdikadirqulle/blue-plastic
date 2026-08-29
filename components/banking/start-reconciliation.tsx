'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, ScaleIcon } from 'lucide-react'

import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { startReconciliation } from '@/app/(app)/banking/actions'

export function StartReconciliationButton({
  accountId,
  accountName,
  today,
}: {
  accountId: string
  accountName: string
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [statementDate, setStatementDate] = useState(today)
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScaleIcon /> Reconcile
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-base font-semibold">Reconcile {accountName}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Take these two figures from the statement. Everything reconciled before this carries forward as
          the opening balance.
        </p>

        {error ? (
          <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-4">
          <Field name="statementDate" label="Statement date" required>
            <Input
              id="statementDate"
              type="date"
              value={statementDate}
              onChange={(event) => setStatementDate(event.target.value)}
              autoFocus
            />
          </Field>
          <Field name="endingBalance" label="Closing balance on the statement" required>
            <Input
              id="endingBalance"
              inputMode="decimal"
              className="tabular"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={isPending || balance.trim() === ''}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await startReconciliation({
                  accountId,
                  statementDate,
                  statementEndingBalance: balance,
                })
                if (result.ok) router.push(`/banking/reconcile/${result.data.id}`)
                else setError(result.error.message)
              })
            }
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Start
          </Button>
        </div>
      </div>
    </div>
  )
}
