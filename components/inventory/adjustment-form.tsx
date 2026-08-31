'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { EntityPicker } from '@/components/forms/entity-picker'
import { AccountPicker } from '@/components/forms/account-picker'
import { Field, fieldProps } from '@/components/forms/field'
import { FormStatus } from '@/components/forms/form-status'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import type { AccountPickerOption } from '@/lib/account-options'
import { formatMoney, parseMoneyInput, ZERO } from '@/lib/money'
import { saveAdjustmentForm } from '@/app/(app)/inventory/actions'

type ItemOption = { id: string; label: string; onHand: string; averageCost: string }
type Line = { key: number; itemId: string; counted: string; description: string }

/**
 * A stock count.
 *
 * The form asks for what the count *found*, not for the difference — because that
 * is what the person holding the clipboard actually knows. The difference is
 * shown as they type, so a typo is obvious before it is posted.
 */
export function AdjustmentForm({
  items,
  accounts,
  today,
  currency,
}: {
  items: ItemOption[]
  accounts: AccountPickerOption[]
  today: string
  currency: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(saveAdjustmentForm, idleState)

  const [date, setDate] = useState(today)
  const [accountId, setAccountId] = useState('')
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: '', counted: '', description: '' }])
  const nextKey = useRef(2)
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Posted.')
      router.push('/inventory')
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const totals = useMemo(() => {
    let value = ZERO
    for (const line of lines) {
      const item = line.itemId ? itemById.get(line.itemId) : null
      const counted = parseMoneyInput(line.counted)
      if (!item || !counted) continue
      const change = counted.minus(item.onHand)
      value = value.plus(change.times(item.averageCost))
    }
    return value
  }, [lines, itemById])

  const filled = lines.filter((line) => line.itemId && line.counted !== '')

  const payload = JSON.stringify({
    date,
    accountId,
    reason,
    memo,
    lines: filled.map((line) => ({
      itemId: line.itemId,
      countedQuantity: line.counted,
      description: line.description,
    })),
  })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <FormStatus state={state} />

          <Field name="date" label="Date of the count" required error={state.fieldErrors?.date}>
            <DateField
              id="date"
              value={date}
              onChange={setDate}
              today={today}
              required
              aria-invalid={state.fieldErrors?.date ? true : undefined}
            />
          </Field>

          <Field
            name="accountId"
            label="Difference goes to"
            hint="Inventory Shrinkage unless you say otherwise."
            error={state.fieldErrors?.accountId}
          >
            <AccountPicker
              id="accountId"
              name="accountId"
              options={accounts}
              value={accountId || null}
              onChange={(next) => setAccountId(next ?? '')}
              placeholder="Inventory Shrinkage (default)"
              clearable
              error={state.fieldErrors?.accountId}
            />
          </Field>

          <Field name="reason" label="Reason" error={state.fieldErrors?.reason}>
            <Input
              {...fieldProps('reason', state.fieldErrors?.reason)}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Quarterly count"
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-72 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Books say
                </th>
                <th className="w-32 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Count found
                </th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Difference
                </th>
                <th className="w-32 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Value</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Note</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const item = line.itemId ? itemById.get(line.itemId) : null
                const counted = parseMoneyInput(line.counted)
                const change = item && counted ? counted.minus(item.onHand) : null
                const value = item && change ? change.times(item.averageCost) : null

                return (
                  <tr key={line.key} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <EntityPicker
                        options={items}
                        value={line.itemId || null}
                        onChange={(next) =>
                          setLines((current) =>
                            current.map((l) => (l.key === line.key ? { ...l, itemId: next ?? '' } : l)),
                          )
                        }
                        placeholder="Search items"
                      />
                    </td>
                    <td className="tabular px-3 py-1.5 text-right text-muted-foreground">
                      {item?.onHand ?? '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Counted quantity"
                        inputMode="decimal"
                        className="tabular text-right"
                        value={line.counted}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((l) =>
                              l.key === line.key ? { ...l, counted: event.target.value } : l,
                            ),
                          )
                        }
                      />
                    </td>
                    <td
                      className={`tabular px-3 py-1.5 text-right ${
                        change && change.isNegative() ? 'text-destructive' : ''
                      }`}
                    >
                      {change ? `${change.isPositive() ? '+' : ''}${change.toFixed(2)}` : '—'}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">
                      {value ? formatMoney(value, currency) : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Note"
                        value={line.description}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((l) =>
                              l.key === line.key ? { ...l, description: event.target.value } : l,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove line"
                        disabled={lines.length <= 1}
                        onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                      >
                        <Trash2Icon />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((current) => [
                ...current,
                { key: nextKey.current++, itemId: '', counted: '', description: '' },
              ])
            }
          >
            <PlusIcon /> Add an item
          </Button>

          <span className="text-sm">
            <span className="text-muted-foreground">Change in stock value </span>
            <span
              className={`tabular text-base font-semibold ${
                totals.isNegative() ? 'text-destructive' : ''
              }`}
            >
              {formatMoney(totals, currency)}
            </span>
          </span>
        </div>
      </Card>

      <Card>
        <CardContent className="p-4">
          <Field name="memo" label="Note" error={state.fieldErrors?.memo}>
            <Input
              {...fieldProps('memo', state.fieldErrors?.memo)}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/inventory')}>
          Cancel
        </Button>
        <SubmitButton disabled={filled.length === 0} pendingLabel="Posting…">
          Post adjustment
        </SubmitButton>
      </div>
    </form>
  )
}
