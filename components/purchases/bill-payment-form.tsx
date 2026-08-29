'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { EntityPicker } from '@/components/forms/entity-picker'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatDate, toCalendarDate } from '@/lib/date'
import { Decimal, formatMoney, parseMoneyInput, ZERO } from '@/lib/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/sales-types'
import { saveBillPaymentForm } from '@/app/(app)/purchases/actions'

type OpenBill = {
  id: string
  number: string
  reference: string | null
  date: string
  dueDate: string | null
  balance: string
}
type Option = { id: string; label: string }

/**
 * Paying bills.
 *
 * Batch payment is the normal case rather than a special one: on pay day someone
 * settles several bills from one bank transfer. Ticking bills sets the amount to
 * pay, and the payment total follows what has been ticked — which is the way
 * round people actually work.
 */
export function BillPaymentForm({
  vendors,
  paymentAccounts,
  today,
  currency,
  loadOpenBills,
}: {
  vendors: Option[]
  paymentAccounts: Option[]
  today: string
  currency: string
  loadOpenBills: (vendorId: string) => Promise<OpenBill[]>
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(saveBillPaymentForm, idleState)

  const [vendorId, setVendorId] = useState('')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [paymentAccountId, setPaymentAccountId] = useState(paymentAccounts[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')

  const [bills, setBills] = useState<OpenBill[]>([])
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [isLoading, startLoading] = useTransition()
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Recorded.')
      router.push('/bill-payments')
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router])

  const chooseVendor = (id: string) => {
    setVendorId(id)
    setApplied({})
    if (!id) {
      setBills([])
      return
    }
    startLoading(async () => setBills(await loadOpenBills(id)))
  }

  const appliedTotal = useMemo(
    () =>
      Object.values(applied).reduce((sum, value) => sum.plus(parseMoneyInput(value) ?? ZERO), ZERO),
    [applied],
  )

  const payAll = () =>
    setApplied(Object.fromEntries(bills.map((bill) => [bill.id, new Decimal(bill.balance).toFixed(2)])))

  const payload = JSON.stringify({
    vendorId,
    date,
    // The payment is exactly what is being settled: batch payment is the point.
    amount: appliedTotal.toFixed(2),
    method,
    paymentAccountId,
    reference,
    memo,
    applications: Object.entries(applied)
      .filter(([, value]) => (parseMoneyInput(value) ?? ZERO).greaterThan(0))
      .map(([billId, value]) => ({ billId, amount: value })),
  })

  const canSave = vendorId !== '' && appliedTotal.greaterThan(0)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormError message={state.message} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field name="vendorId" label="Vendor" required error={state.fieldErrors?.vendorId}>
              <EntityPicker
                id="vendorId"
                kind="vendor"
                options={vendors}
                value={vendorId || null}
                onChange={(next) => chooseVendor(next ?? '')}
                placeholder="Search or add a vendor"
                required
                error={state.fieldErrors?.vendorId}
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
              name="paymentAccountId"
              label="Paid from"
              required
              error={state.fieldErrors?.paymentAccountId}
            >
              <NativeSelect
                {...fieldProps('paymentAccountId', state.fieldErrors?.paymentAccountId)}
                value={paymentAccountId}
                onChange={(event) => setPaymentAccountId(event.target.value)}
                required
              >
                {paymentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field name="method" label="Method" error={state.fieldErrors?.method}>
              <NativeSelect
                {...fieldProps('method', state.fieldErrors?.method)}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field name="reference" label="Reference" error={state.fieldErrors?.reference}>
              <Input
                {...fieldProps('reference', state.fieldErrors?.reference)}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Cheque or transfer number"
              />
            </Field>

            <Field name="memo" label="Note" error={state.fieldErrors?.memo}>
              <Input
                {...fieldProps('memo', state.fieldErrors?.memo)}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {vendorId ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <span className="text-sm font-semibold">Unpaid bills</span>
            <Button type="button" variant="outline" size="sm" onClick={payAll} disabled={bills.length === 0}>
              Pay all
            </Button>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing outstanding for this vendor.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bill</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Their ref</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Due</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Owing</th>
                  <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Pay</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-b last:border-0">
                    <td className="tabular px-3 py-2 font-medium">{bill.number}</td>
                    <td className="px-3 py-2 text-muted-foreground">{bill.reference ?? '—'}</td>
                    <td className="tabular px-3 py-2 text-muted-foreground">
                      {bill.dueDate ? formatDate(toCalendarDate(new Date(bill.dueDate))) : '—'}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{formatMoney(bill.balance, currency)}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label={`Pay ${bill.number}`}
                        inputMode="decimal"
                        className="tabular text-right"
                        value={applied[bill.id] ?? ''}
                        onChange={(event) =>
                          setApplied((current) => ({ ...current, [bill.id]: event.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-end border-t p-3 text-sm">
            <span>
              <span className="text-muted-foreground">Paying </span>
              <span className="tabular text-base font-semibold">
                {formatMoney(appliedTotal, currency)}
              </span>
            </span>
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/bill-payments')}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          Pay {formatMoney(appliedTotal, currency)}
        </Button>
      </div>
    </form>
  )
}
