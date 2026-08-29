'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, LockIcon, UnlockIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeFiscalYear, reopenFiscalYear } from './actions'

/**
 * Closing a year posts a journal, so it asks first. Reopening one reverses that
 * journal, so it asks for a reason as well — the reversal carries it into the
 * ledger, where anybody looking at the year later will find it.
 */
export function CloseYearButton({
  fiscalYearId,
  year,
  netIncome,
  blocked,
}: {
  fiscalYearId: string
  year: number
  netIncome: string
  blocked: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (blocked) {
    return (
      <p className="text-sm text-destructive">
        The books do not agree with themselves. Fix that before closing the year.
      </p>
    )
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <LockIcon /> Close fiscal year {year}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
      <p>
        This posts a closing entry taking every income and expense account to zero and moving{' '}
        <strong className="tabular">{netIncome}</strong> to Retained Earnings, then locks fiscal year {year}.
      </p>
      <p className="text-muted-foreground">
        It can be undone: reopening the year reverses the entry rather than deleting it.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await closeFiscalYear({ fiscalYearId })
              if (result.ok) {
                toast.success(
                  result.data.journalNumber
                    ? `Fiscal year ${year} closed with ${result.data.journalNumber}.`
                    : `Fiscal year ${year} closed. There was nothing to close out.`,
                )
                setConfirming(false)
                router.refresh()
              } else {
                toast.error(result.error.message)
              }
            })
          }
        >
          {isPending ? <Loader2Icon className="animate-spin" /> : <LockIcon />}
          Close the year
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function ReopenYearButton({ fiscalYearId, year }: { fiscalYearId: string; year: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <UnlockIcon /> Reopen fiscal year {year}
      </Button>
    )
  }

  return (
    <form
      className="space-y-2 rounded-md border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await reopenFiscalYear({ fiscalYearId, reason })
          if (result.ok) {
            toast.success(
              result.data.reversalJournal
                ? `Fiscal year ${year} reopened; closing entry reversed by ${result.data.reversalJournal}.`
                : `Fiscal year ${year} reopened.`,
            )
            setConfirming(false)
            setReason('')
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }}
    >
      <p className="text-muted-foreground">
        The closing entry will be reversed, and every period in the year unlocked. Any statement already
        given out for fiscal year {year} may stop matching the books.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="reopen-reason">Why</Label>
        <Input
          id="reopen-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Depreciation for March was missed"
          required
          maxLength={300}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={isPending || reason.trim().length === 0}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <UnlockIcon />}
          Reopen the year
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
