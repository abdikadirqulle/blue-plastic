'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { EntityPicker } from '@/components/forms/entity-picker'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Decimal, formatMoney, parseMoneyInput } from '@/lib/money'
import { cn } from '@/lib/utils'
import { postManualJournalForm } from '../actions'

export type PostableAccount = {
  id: string
  code: string
  name: string
}

type Line = {
  key: number
  accountId: string
  debit: string
  credit: string
  description: string
}

const EMPTY = (key: number): Line => ({ key, accountId: '', debit: '', credit: '', description: '' })

/**
 * The one screen where a person chooses both sides of an entry, so it has to
 * show the arithmetic as they type. A journal that does not balance cannot be
 * submitted here, cannot be posted by the engine, and cannot be committed by the
 * database — but only this layer can say so before the work is lost.
 */
export function JournalEntryForm({
  accounts,
  today,
  currency,
}: {
  accounts: PostableAccount[]
  today: string
  currency: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(postManualJournalForm, idleState)
  const [lines, setLines] = useState<Line[]>([EMPTY(1), EMPTY(2)])
  const [date, setDate] = useState(today)
  const [memo, setMemo] = useState('')
  const [isAdjusting, setIsAdjusting] = useState(false)
  const nextKey = useRef(3)
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Journal posted.')
      router.push('/journals')
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router])

  const totals = useMemo(() => {
    let debit = new Decimal(0)
    let credit = new Decimal(0)
    for (const line of lines) {
      debit = debit.plus(parseMoneyInput(line.debit) ?? 0)
      credit = credit.plus(parseMoneyInput(line.credit) ?? 0)
    }
    return { debit, credit, difference: debit.minus(credit) }
  }, [lines])

  const filled = lines.filter((line) => line.accountId && (line.debit !== '' || line.credit !== ''))
  const balanced = totals.difference.isZero() && !totals.debit.isZero()
  const canPost = balanced && filled.length >= 2 && memo.trim() !== ''

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const payload = JSON.stringify({
    date,
    memo,
    isAdjusting,
    lines: filled.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormError message={state.message} />

          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field name="date" label="Date" required error={state.fieldErrors?.date}>
              <Input
                {...fieldProps('date', state.fieldErrors?.date)}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>

            <Field
              name="memo"
              label="Description"
              hint="What this entry records. It appears on the register and on every report that drills into it."
              required
              error={state.fieldErrors?.memo}
            >
              <Input
                {...fieldProps('memo', state.fieldErrors?.memo, true)}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Depreciation for March"
                required
              />
            </Field>
          </div>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdjusting}
              onChange={(event) => setIsAdjusting(event.target.checked)}
              className="size-4 rounded border-input"
            />
            <span>
              Adjusting entry
              <span className="ml-1.5 text-xs text-muted-foreground">
                — flagged separately on reports, for period-end adjustments
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <EntityPicker
                      options={accounts.map((account) => ({
                        id: account.id,
                        label: account.name,
                        hint: account.code,
                      }))}
                      value={line.accountId || null}
                      onChange={(next) => update(line.key, { accountId: next ?? '' })}
                      placeholder="Search accounts"
                      emptyMessage="No account matches. Search by code or by name."
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label="Line description"
                      value={line.description}
                      onChange={(event) => update(line.key, { description: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label="Debit"
                      inputMode="decimal"
                      className="tabular text-right"
                      value={line.debit}
                      onChange={(event) =>
                        update(line.key, { debit: event.target.value, credit: '' })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label="Credit"
                      inputMode="decimal"
                      className="tabular text-right"
                      value={line.credit}
                      onChange={(event) =>
                        update(line.key, { credit: event.target.value, debit: '' })
                      }
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove line"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={2}>
                  Totals
                </td>
                <td className="tabular px-3 py-2 text-right">{formatMoney(totals.debit, currency)}</td>
                <td className="tabular px-3 py-2 text-right">{formatMoney(totals.credit, currency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, EMPTY(nextKey.current++)])}
          >
            <PlusIcon /> Add line
          </Button>

          <p
            aria-live="polite"
            className={cn(
              'tabular text-sm font-medium',
              balanced ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {totals.difference.isZero()
              ? balanced
                ? 'Balanced'
                : 'Enter the amounts'
              : `Out of balance by ${formatMoney(totals.difference.abs(), currency)} — ${
                  totals.difference.isPositive() ? 'credits' : 'debits'
                } are short`}
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/journals')}>
          Cancel
        </Button>
        <PostButton disabled={!canPost} />
      </div>
    </form>
  )
}

function PostButton({ disabled }: { disabled: boolean }) {
  return (
    <Button type="submit" disabled={disabled}>
      Post journal
    </Button>
  )
}
