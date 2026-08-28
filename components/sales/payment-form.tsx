'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDate, toCalendarDate } from '@/lib/date'
import { Decimal, formatMoney, parseMoneyInput, ZERO } from '@/lib/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/sales-types'
import { savePaymentForm } from '@/app/(app)/sales/actions'

type OpenInvoice = { id: string; number: string; date: string; dueDate: string | null; balance: string }
type Option = { id: string; label: string }

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

/**
 * Recording money received.
 *
 * The payment is entered first and applied second, in that order, because that is
 * what actually happened: the money arrived, and then someone decided what it was
 * for. Anything left unapplied stays on the balance sheet as a customer credit
 * rather than being forced onto an invoice it may not belong to.
 */
export function PaymentForm({
  customers,
  depositAccounts,
  today,
  currency,
  loadOpenInvoices,
}: {
  customers: Option[]
  depositAccounts: Option[]
  today: string
  currency: string
  loadOpenInvoices: (customerId: string) => Promise<OpenInvoice[]>
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(savePaymentForm, idleState)

  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [depositAccountId, setDepositAccountId] = useState(depositAccounts[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')

  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [isLoading, startLoading] = useTransition()
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Recorded.')
      router.push('/payments')
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router])

  /**
   * Choosing a customer fetches what they still owe. Done in the handler rather
   * than an effect: it is a response to an action, not a synchronisation.
   */
  const chooseCustomer = (id: string) => {
    setCustomerId(id)
    setApplied({})
    if (!id) {
      setInvoices([])
      return
    }
    startLoading(async () => setInvoices(await loadOpenInvoices(id)))
  }

  const totals = useMemo(() => {
    const received = parseMoneyInput(amount) ?? ZERO
    const appliedTotal = Object.values(applied).reduce(
      (sum, value) => sum.plus(parseMoneyInput(value) ?? ZERO),
      ZERO,
    )
    return { received, appliedTotal, unapplied: received.minus(appliedTotal) }
  }, [amount, applied])

  /** Oldest first, until the money runs out — how a remittance is usually meant. */
  const autoApply = () => {
    let remaining = parseMoneyInput(amount) ?? ZERO
    const next: Record<string, string> = {}
    for (const invoice of invoices) {
      if (remaining.lessThanOrEqualTo(0)) break
      const balance = new Decimal(invoice.balance)
      const take = Decimal.min(balance, remaining)
      next[invoice.id] = take.toFixed(2)
      remaining = remaining.minus(take)
    }
    setApplied(next)
  }

  const payload = JSON.stringify({
    customerId,
    date,
    amount,
    method,
    depositAccountId,
    reference,
    memo,
    applications: Object.entries(applied)
      .filter(([, value]) => (parseMoneyInput(value) ?? ZERO).greaterThan(0))
      .map(([invoiceId, value]) => ({ invoiceId, amount: value })),
  })

  const overApplied = totals.unapplied.isNegative()
  const canSave = customerId !== '' && totals.received.greaterThan(0) && !overApplied

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormError message={state.message} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field name="customerId" label="Customer" required error={state.fieldErrors?.customerId}>
              <select
                {...fieldProps('customerId', state.fieldErrors?.customerId)}
                value={customerId}
                onChange={(event) => chooseCustomer(event.target.value)}
                className={selectClass}
                required
              >
                <option value="">— choose —</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field name="date" label="Date" required error={state.fieldErrors?.date}>
              <Input
                {...fieldProps('date', state.fieldErrors?.date)}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>

            <Field name="amount" label={`Amount received (${currency})`} required error={state.fieldErrors?.amount}>
              <Input
                {...fieldProps('amount', state.fieldErrors?.amount)}
                inputMode="decimal"
                className="tabular"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
              />
            </Field>

            <Field name="method" label="Method" error={state.fieldErrors?.method}>
              <select
                {...fieldProps('method', state.fieldErrors?.method)}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                className={selectClass}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              name="depositAccountId"
              label="Deposit to"
              hint="Undeposited Funds if it is in hand but not yet banked."
              required
              error={state.fieldErrors?.depositAccountId}
            >
              <select
                {...fieldProps('depositAccountId', state.fieldErrors?.depositAccountId, true)}
                value={depositAccountId}
                onChange={(event) => setDepositAccountId(event.target.value)}
                className={selectClass}
                required
              >
                {depositAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
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

      {customerId ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <span className="text-sm font-semibold">Outstanding invoices</span>
            <Button type="button" variant="outline" size="sm" onClick={autoApply} disabled={invoices.length === 0}>
              Apply oldest first
            </Button>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nothing outstanding. The payment will sit as an unapplied credit until it is put against an
              invoice — which is where it belongs until someone decides what it was for.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Due</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                  <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Apply</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-0">
                    <td className="tabular px-3 py-2 font-medium">{invoice.number}</td>
                    <td className="tabular px-3 py-2 text-muted-foreground">
                      {invoice.dueDate ? formatDate(toCalendarDate(new Date(invoice.dueDate))) : '—'}
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {formatMoney(invoice.balance, currency)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label={`Apply to ${invoice.number}`}
                        inputMode="decimal"
                        className="tabular text-right"
                        value={applied[invoice.id] ?? ''}
                        onChange={(event) =>
                          setApplied((current) => ({ ...current, [invoice.id]: event.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex flex-wrap justify-end gap-8 border-t p-3 text-sm">
            <span>
              <span className="text-muted-foreground">Applied </span>
              <span className="tabular font-medium">{formatMoney(totals.appliedTotal, currency)}</span>
            </span>
            <span className={overApplied ? 'text-destructive' : ''}>
              <span className={overApplied ? '' : 'text-muted-foreground'}>
                {overApplied ? 'Over-applied by ' : 'Unapplied '}
              </span>
              <span className="tabular font-medium">
                {formatMoney(totals.unapplied.abs(), currency)}
              </span>
            </span>
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/payments')}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          Record payment
        </Button>
      </div>
    </form>
  )
}
