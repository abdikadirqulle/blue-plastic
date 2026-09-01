'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { AccountPicker } from '@/components/forms/account-picker'
import { Field, fieldProps } from '@/components/forms/field'
import { FormStatus } from '@/components/forms/form-status'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import type { AccountPickerOption, PartyRequirement } from '@/lib/account-options'
import { Decimal, formatMoney, parseMoneyInput } from '@/lib/money'
import { cn } from '@/lib/utils'
import { postManualJournalForm } from '../actions'

export type PartyOption = { id: string; label: string; hint?: string }

/**
 * A name on a line is one value, not two fields.
 *
 * The ledger stores a customer id and a vendor id separately, because they point
 * at different tables and a receivables line must carry the first while a
 * payables line must carry the second. But nobody choosing a name thinks in those
 * terms — they think "Ahmed Trading". So the picker offers one list under two
 * headings and the side it came from is remembered here.
 */
type PartyValue = { kind: 'customer' | 'vendor'; id: string } | null

const partyKey = (value: PartyValue) => (value ? `${value.kind}:${value.id}` : null)

const parsePartyKey = (key: string | null): PartyValue => {
  if (!key) return null
  const [kind, id] = key.split(':')
  return kind === 'customer' || kind === 'vendor' ? { kind, id } : null
}

type Line = {
  key: number
  accountId: string
  debit: string
  credit: string
  description: string
  party: PartyValue
}

const EMPTY = (key: number): Line => ({
  key,
  accountId: '',
  debit: '',
  credit: '',
  description: '',
  party: null,
})

/**
 * The one screen where a person chooses both sides of an entry.
 *
 * Three things it has to do that a plain grid does not. It shows the arithmetic
 * as they type, because a journal that does not balance cannot be posted by the
 * engine and cannot be committed by the database — but only this layer can say so
 * before the work is lost. It offers **the whole chart**, receivables and
 * payables included, because most of what a business records by hand is against
 * exactly those. And it carries a **Name** on every line, because who a line was
 * with is worth recording whatever the account — and because on a receivables or
 * payables line the ledger will refuse the line without it (R7), and being
 * refused on submit is not an explanation.
 */
export function JournalEntryForm({
  accounts,
  customers,
  vendors,
  entryNumber,
  today,
  currency,
}: {
  accounts: AccountPickerOption[]
  customers: PartyOption[]
  vendors: PartyOption[]
  /** The number this entry will take. A preview — see `peekDocumentNumber`. */
  entryNumber: string
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

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )

  /** Customers and vendors in one list, each under its own heading. */
  const partyOptions = useMemo(
    () => [
      ...customers.map((party) => ({
        value: `customer:${party.id}`,
        label: party.label,
        hint: party.hint,
        group: 'Customers',
      })),
      ...vendors.map((party) => ({
        value: `vendor:${party.id}`,
        label: party.label,
        hint: party.hint,
        group: 'Vendors',
      })),
    ],
    [customers, vendors],
  )

  const customerOptions = useMemo(
    () => partyOptions.filter((option) => option.value.startsWith('customer:')),
    [partyOptions],
  )
  const vendorOptions = useMemo(
    () => partyOptions.filter((option) => option.value.startsWith('vendor:')),
    [partyOptions],
  )

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

  // The same rules the service applies, said here so the button can explain why
  // it is unavailable rather than the server explaining it after the fact.
  const wrongParty = filled.find((line) => {
    const requires = requirementOf(accountsById.get(line.accountId))
    if (!requires) return false
    return line.party?.kind !== requires
  })

  const balanced = totals.difference.isZero() && !totals.debit.isZero()
  const canPost = balanced && filled.length >= 2 && memo.trim() !== '' && !wrongParty

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  /** Changing the account drops a name of the wrong kind for the new account. */
  const chooseAccount = (line: Line, accountId: string | null) => {
    const requires = requirementOf(accountsById.get(accountId ?? ''))
    update(line.key, {
      accountId: accountId ?? '',
      party: requires && line.party?.kind !== requires ? null : line.party,
    })
  }

  const payload = JSON.stringify({
    date,
    memo,
    isAdjusting,
    lines: filled.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
      customerId: line.party?.kind === 'customer' ? line.party.id : null,
      vendorId: line.party?.kind === 'vendor' ? line.party.id : null,
    })),
  })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormStatus state={state} />

          <div className="grid gap-4 sm:grid-cols-[12rem_12rem_1fr]">
            <Field
              name="entryNumber"
              label="Entry number"
              hint="Assigned when this is posted."
            >
              <Input
                id="entryNumber"
                value={entryNumber}
                readOnly
                disabled
                className="tabular"
              />
            </Field>

            <Field name="date" label="Date" required error={state.fieldErrors?.date}>
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
                <th className="min-w-56 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Account
                </th>
                <th className="min-w-44 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const account = accountsById.get(line.accountId)
                const requires = requirementOf(account)
                const options =
                  requires === 'customer'
                    ? customerOptions
                    : requires === 'vendor'
                      ? vendorOptions
                      : partyOptions

                return (
                  <tr key={line.key} className="border-b align-top last:border-0">
                    <td className="px-2 py-1.5">
                      <AccountPicker
                        options={accounts}
                        value={line.accountId || null}
                        onChange={(next) => chooseAccount(line, next)}
                        clearable
                      />
                      {account ? (
                        <span className="mt-1 block px-1 text-xs text-muted-foreground">
                          {account.hint}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-2 py-1.5">
                      <Combobox
                        options={options}
                        value={partyKey(line.party)}
                        onChange={(next) => update(line.key, { party: parsePartyKey(next) })}
                        placeholder={
                          requires === 'customer'
                            ? 'Which customer'
                            : requires === 'vendor'
                              ? 'Which vendor'
                              : 'Customer or vendor'
                        }
                        emptyMessage="No name matches. Add them under Customers or Vendors."
                        clearable
                        aria-label="Name"
                      />
                      {requires ? (
                        <span
                          className={cn(
                            'mt-1 block px-1 text-xs',
                            line.party?.kind === requires
                              ? 'text-muted-foreground'
                              : 'text-destructive',
                          )}
                        >
                          {requires === 'customer'
                            ? 'A customer is required on a receivables line'
                            : 'A vendor is required on a payables line'}
                        </span>
                      ) : null}
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
                        onClick={() =>
                          setLines((current) => current.filter((l) => l.key !== line.key))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={3}>
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
              balanced && !wrongParty ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {!totals.difference.isZero()
              ? `Out of balance by ${formatMoney(totals.difference.abs(), currency)} — ${
                  totals.difference.isPositive() ? 'credits' : 'debits'
                } are short`
              : !balanced
                ? 'Enter the amounts'
                : wrongParty
                  ? `Name the ${
                      requirementOf(accountsById.get(wrongParty.accountId)) === 'customer'
                        ? 'customer'
                        : 'vendor'
                    } on the control-account line`
                  : 'Balanced'}
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/journals')}>
          Cancel
        </Button>
        <SubmitButton disabled={!canPost} pendingLabel="Posting…">
          Post journal
        </SubmitButton>
      </div>
    </form>
  )
}

const requirementOf = (account: AccountPickerOption | undefined): PartyRequirement =>
  account?.requiresParty ?? null
