'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Decimal, formatMoney, parseMoneyInput, ZERO } from '@/lib/money'
import type { SalesTypeConfig } from '@/lib/sales-types'
import { saveDocumentForm } from '@/app/(app)/sales/actions'

export type ItemOption = {
  id: string
  label: string
  price: string | null
  description: string | null
  taxCodeId: string | null
}
export type Option = { id: string; label: string }
export type TaxOption = Option & { rate: number; isInclusive: boolean }

type Line = {
  key: number
  itemId: string
  description: string
  quantity: string
  unitPrice: string
  discountPercent: string
  taxCodeId: string
}

const empty = (key: number): Line => ({
  key,
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discountPercent: '',
  taxCodeId: '',
})

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

/**
 * One form for every customer-facing document. The type decides the wording, the
 * fields shown and where the money goes — not the arithmetic, which is identical
 * for all of them.
 *
 * Totals are recomputed on the server before anything is written. What is shown
 * here is a preview using the same order of operations, so the number on screen
 * matches the number that posts.
 */
export function DocumentForm({
  config,
  customers,
  items,
  taxCodes,
  depositAccounts,
  terms,
  today,
  currency,
  document,
}: {
  config: SalesTypeConfig
  customers: Option[]
  items: ItemOption[]
  taxCodes: TaxOption[]
  depositAccounts: Option[]
  terms: Option[]
  today: string
  currency: string
  document?: {
    id: string
    customerId: string
    date: string
    reference: string | null
    memo: string | null
    customerMessage: string | null
    paymentTermId: string | null
    depositAccountId: string | null
    lines: {
      itemId: string | null
      description: string | null
      quantity: string
      unitPrice: string
      discountPercent: string | null
      taxCodeId: string | null
    }[]
  }
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(saveDocumentForm, idleState)

  const [customerId, setCustomerId] = useState(document?.customerId ?? '')
  const [date, setDate] = useState(document?.date ?? today)
  const [reference, setReference] = useState(document?.reference ?? '')
  const [memo, setMemo] = useState(document?.memo ?? '')
  const [customerMessage, setCustomerMessage] = useState(document?.customerMessage ?? '')
  const [paymentTermId, setPaymentTermId] = useState(document?.paymentTermId ?? '')
  const [depositAccountId, setDepositAccountId] = useState(
    document?.depositAccountId ?? depositAccounts[0]?.id ?? '',
  )
  const [lines, setLines] = useState<Line[]>(
    document?.lines.length
      ? document.lines.map((line, index) => ({
          key: index + 1,
          itemId: line.itemId ?? '',
          description: line.description ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent ?? '',
          taxCodeId: line.taxCodeId ?? '',
        }))
      : [empty(1), empty(2)],
  )
  const nextKey = useRef((document?.lines.length ?? 2) + 1)
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Saved.')
      router.push(`/sales/${config.slug}`)
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router, config.slug])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const taxById = useMemo(() => new Map(taxCodes.map((code) => [code.id, code])), [taxCodes])

  /** Mirrors `server/accounting/sales-pricing.ts`: price, then discount, then tax. */
  const totals = useMemo(() => {
    let subtotal = ZERO
    let tax = ZERO

    for (const line of lines) {
      const quantity = parseMoneyInput(line.quantity) ?? ZERO
      const price = parseMoneyInput(line.unitPrice) ?? ZERO
      if (quantity.isZero() && price.isZero()) continue

      const gross = quantity.times(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      const discountPercent = parseMoneyInput(line.discountPercent) ?? ZERO
      const discount = gross.times(discountPercent).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      const amount = gross.minus(discount)

      const code = line.taxCodeId ? taxById.get(line.taxCodeId) : null
      if (!code) {
        subtotal = subtotal.plus(amount)
        continue
      }

      if (code.isInclusive) {
        const net = amount.dividedBy(new Decimal(1).plus(code.rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        subtotal = subtotal.plus(net)
        tax = tax.plus(amount.minus(net))
      } else {
        subtotal = subtotal.plus(amount)
        tax = tax.plus(amount.times(code.rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
      }
    }

    return { subtotal, tax, total: subtotal.plus(tax) }
  }, [lines, taxById])

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  /** Choosing an item fills in its price, description and default tax. */
  const chooseItem = (key: number, itemId: string) => {
    const item = itemId ? itemById.get(itemId) : null
    update(key, {
      itemId,
      description: item?.description ?? '',
      unitPrice: item?.price ?? '',
      taxCodeId: item?.taxCodeId ?? '',
    })
  }

  const filled = lines.filter(
    (line) => line.itemId || line.description || parseMoneyInput(line.unitPrice)?.greaterThan(0),
  )

  const payloadFor = (saveAsDraft: boolean) =>
    JSON.stringify({
      ...(document?.id ? { id: document.id } : { type: config.type }),
      customerId,
      date,
      reference,
      memo,
      customerMessage,
      paymentTermId,
      depositAccountId: config.needsDeposit ? depositAccountId : '',
      saveAsDraft,
      lines: filled.map((line) => ({
        itemId: line.itemId,
        description: line.description,
        quantity: line.quantity || '1',
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxCodeId: line.taxCodeId,
      })),
    })

  const [saveAsDraft, setSaveAsDraft] = useState(false)
  const canSave = customerId !== '' && filled.length > 0 && totals.total.greaterThan(0)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payloadFor(saveAsDraft)} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormError message={state.message} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field name="customerId" label="Customer" required error={state.fieldErrors?.customerId}>
              <select
                {...fieldProps('customerId', state.fieldErrors?.customerId)}
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
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

            {config.type === 'INVOICE' ? (
              <Field
                name="paymentTermId"
                label="Terms"
                hint="Sets the due date from this document's own date."
                error={state.fieldErrors?.paymentTermId}
              >
                <select
                  {...fieldProps('paymentTermId', state.fieldErrors?.paymentTermId, true)}
                  value={paymentTermId}
                  onChange={(event) => setPaymentTermId(event.target.value)}
                  className={selectClass}
                >
                  <option value="">Customer&rsquo;s default</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {config.needsDeposit ? (
              <Field
                name="depositAccountId"
                label={config.type === 'REFUND_RECEIPT' ? 'Paid from' : 'Deposit to'}
                required
                error={state.fieldErrors?.depositAccountId}
              >
                <select
                  {...fieldProps('depositAccountId', state.fieldErrors?.depositAccountId)}
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
            ) : null}

            <Field name="reference" label="Their reference" error={state.fieldErrors?.reference}>
              <Input
                {...fieldProps('reference', state.fieldErrors?.reference)}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="PO number"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-56 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="w-24 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Price</th>
                <th className="w-20 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Disc %</th>
                <th className="w-40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tax</th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const quantity = parseMoneyInput(line.quantity) ?? ZERO
                const price = parseMoneyInput(line.unitPrice) ?? ZERO
                const gross = quantity.times(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                const discount = gross
                  .times(parseMoneyInput(line.discountPercent) ?? ZERO)
                  .dividedBy(100)
                  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

                return (
                  <tr key={line.key} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Item"
                        value={line.itemId}
                        onChange={(event) => chooseItem(line.key, event.target.value)}
                        className={selectClass}
                      >
                        <option value="">— none —</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Description"
                        value={line.description}
                        onChange={(event) => update(line.key, { description: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Quantity"
                        inputMode="decimal"
                        className="tabular text-right"
                        value={line.quantity}
                        onChange={(event) => update(line.key, { quantity: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Unit price"
                        inputMode="decimal"
                        className="tabular text-right"
                        value={line.unitPrice}
                        onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Discount percent"
                        inputMode="decimal"
                        className="tabular text-right"
                        value={line.discountPercent}
                        onChange={(event) => update(line.key, { discountPercent: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Tax code"
                        value={line.taxCodeId}
                        onChange={(event) => update(line.key, { taxCodeId: event.target.value })}
                        className={selectClass}
                      >
                        <option value="">No tax</option>
                        {taxCodes.map((code) => (
                          <option key={code.id} value={code.id}>
                            {code.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">
                      {formatMoney(gross.minus(discount), currency)}
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

        <div className="flex flex-wrap items-start justify-between gap-4 border-t p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, empty(nextKey.current++)])}
          >
            <PlusIcon /> Add line
          </Button>

          <dl className="min-w-52 space-y-1 text-sm">
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular">{formatMoney(totals.subtotal, currency)}</dd>
            </div>
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular">{formatMoney(totals.tax, currency)}</dd>
            </div>
            <div className="flex justify-between gap-8 border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(totals.total, currency)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          <Field name="customerMessage" label="Message on the document" error={state.fieldErrors?.customerMessage}>
            <Input
              {...fieldProps('customerMessage', state.fieldErrors?.customerMessage)}
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
              placeholder="Thank you for your business"
            />
          </Field>
          <Field name="memo" label="Internal note" hint="Not shown to the customer." error={state.fieldErrors?.memo}>
            <Input
              {...fieldProps('memo', state.fieldErrors?.memo, true)}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/sales/${config.slug}`)}>
          Cancel
        </Button>
        {config.posts ? (
          <Button type="submit" variant="outline" disabled={!canSave} onClick={() => setSaveAsDraft(true)}>
            Save as draft
          </Button>
        ) : null}
        <Button type="submit" disabled={!canSave} onClick={() => setSaveAsDraft(false)}>
          {config.posts ? `Save and post` : `Save ${config.singular.toLowerCase()}`}
        </Button>
      </div>

      {config.posts ? (
        <p className="text-right text-xs text-muted-foreground">{config.effect}</p>
      ) : (
        <p className="text-right text-xs text-muted-foreground">{config.effect}</p>
      )}
    </form>
  )
}
