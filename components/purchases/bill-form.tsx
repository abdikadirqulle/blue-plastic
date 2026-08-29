'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { EntityPicker } from '@/components/forms/entity-picker'
import { Field, fieldProps } from '@/components/forms/field'
import { FormStatus } from '@/components/forms/form-status'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Decimal, formatMoney, parseMoneyInput, ZERO } from '@/lib/money'
import type { PurchaseTypeConfig } from '@/lib/purchase-types'
import { savePurchaseForm } from '@/app/(app)/purchases/actions'

export type VendorOption = { id: string; label: string; defaultExpenseAccountId: string | null }
export type PurchaseItemOption = {
  id: string
  label: string
  price: string | null
  description: string | null
  taxCodeId: string | null
  expenseAccountId: string | null
}
export type Option = { id: string; label: string }
export type TaxOption = Option & { rate: number; isInclusive: boolean }

type Line = {
  key: number
  itemId: string
  expenseAccountId: string
  description: string
  quantity: string
  unitPrice: string
  taxCodeId: string
}

const empty = (key: number, account = ''): Line => ({
  key,
  itemId: '',
  expenseAccountId: account,
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
})

/**
 * One form for bills, expenses, vendor credits and purchase orders.
 *
 * The purchase side asks one thing the sales side does not: **where does this
 * cost go?** Every line names an expense or asset account, pre-filled from the
 * item or the vendor's default, because a bill that lands in Uncategorised
 * Expense is a bill somebody has to come back to.
 */
export function BillForm({
  config,
  vendors,
  items,
  taxCodes,
  paymentAccounts,
  expenseAccounts,
  terms,
  today,
  currency,
  document,
}: {
  config: PurchaseTypeConfig
  vendors: VendorOption[]
  items: PurchaseItemOption[]
  taxCodes: TaxOption[]
  paymentAccounts: Option[]
  expenseAccounts: Option[]
  terms: Option[]
  today: string
  currency: string
  /** Present when editing. Saving reverses the original journal and posts a new one. */
  document?: {
    id: string
    vendorId: string
    date: string
    reference: string | null
    memo: string | null
    paymentTermId: string | null
    paymentAccountId: string | null
    lines: {
      itemId: string | null
      expenseAccountId: string | null
      description: string | null
      quantity: string
      unitPrice: string
      taxCodeId: string | null
    }[]
  }
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(savePurchaseForm, idleState)

  const [vendorId, setVendorId] = useState(document?.vendorId ?? '')
  const [date, setDate] = useState(document?.date ?? today)
  const [reference, setReference] = useState(document?.reference ?? '')
  const [memo, setMemo] = useState(document?.memo ?? '')
  const [paymentTermId, setPaymentTermId] = useState(document?.paymentTermId ?? '')
  const [paymentAccountId, setPaymentAccountId] = useState(
    document?.paymentAccountId ?? paymentAccounts[0]?.id ?? '',
  )
  const [lines, setLines] = useState<Line[]>(
    document?.lines.length
      ? document.lines.map((line, index) => ({
          key: index + 1,
          itemId: line.itemId ?? '',
          expenseAccountId: line.expenseAccountId ?? '',
          description: line.description ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCodeId: line.taxCodeId ?? '',
        }))
      : [empty(1), empty(2)],
  )
  const [saveAsDraft, setSaveAsDraft] = useState(false)
  const nextKey = useRef((document?.lines.length ?? 2) + 1)
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Saved.')
      router.push(document?.id ? `/purchases/${config.slug}/${document.id}` : `/purchases/${config.slug}`)
      router.refresh()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router, config.slug, document?.id])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const taxById = useMemo(() => new Map(taxCodes.map((code) => [code.id, code])), [taxCodes])

  /**
   * No tax codes set up means this business does not charge tax, so the column
   * is not shown at all. An empty dropdown reading "No tax" on every line is a
   * question the form is asking and already knows the answer to.
   */
  const showTax = taxCodes.length > 0

  const totals = useMemo(() => {
    let subtotal = ZERO
    let tax = ZERO

    for (const line of lines) {
      const quantity = parseMoneyInput(line.quantity) ?? ZERO
      const price = parseMoneyInput(line.unitPrice) ?? ZERO
      if (quantity.isZero() && price.isZero()) continue

      const amount = quantity.times(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
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

  /** Choosing a vendor pre-fills empty lines with their usual cost account. */
  const chooseVendor = (id: string) => {
    setVendorId(id)
    const fallback = vendors.find((vendor) => vendor.id === id)?.defaultExpenseAccountId ?? ''
    if (!fallback) return
    setLines((current) =>
      current.map((line) =>
        line.expenseAccountId === '' && line.itemId === ''
          ? { ...line, expenseAccountId: fallback }
          : line,
      ),
    )
  }

  const chooseItem = (key: number, itemId: string) => {
    const item = itemId ? itemById.get(itemId) : null
    update(key, {
      itemId,
      description: item?.description ?? '',
      unitPrice: item?.price ?? '',
      taxCodeId: item?.taxCodeId ?? '',
      expenseAccountId: item?.expenseAccountId ?? '',
    })
  }

  const filled = lines.filter(
    (line) => line.itemId || line.description || parseMoneyInput(line.unitPrice)?.greaterThan(0),
  )

  const payload = JSON.stringify({
    ...(document?.id ? { id: document.id } : { type: config.type }),
    vendorId,
    date,
    reference,
    memo,
    paymentTermId,
    paymentAccountId: config.needsPaymentAccount ? paymentAccountId : '',
    saveAsDraft,
    lines: filled.map((line) => ({
      itemId: line.itemId,
      expenseAccountId: line.expenseAccountId,
      description: line.description,
      quantity: line.quantity || '1',
      unitPrice: line.unitPrice,
      taxCodeId: line.taxCodeId,
    })),
  })

  const canSave = vendorId !== '' && filled.length > 0 && totals.total.greaterThan(0)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <FormStatus state={state} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            {config.type === 'BILL' ? (
              <Field name="paymentTermId" label="Terms" error={state.fieldErrors?.paymentTermId}>
                <NativeSelect
                  {...fieldProps('paymentTermId', state.fieldErrors?.paymentTermId)}
                  value={paymentTermId}
                  onChange={(event) => setPaymentTermId(event.target.value)}
                >
                  <option value="">Vendor&rsquo;s default</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}

            {config.needsPaymentAccount ? (
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
            ) : null}

            <Field
              name="reference"
              label="Their document number"
              hint="What to quote when querying it."
              error={state.fieldErrors?.reference}
            >
              <Input
                {...fieldProps('reference', state.fieldErrors?.reference, true)}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
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
                <th className="w-48 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="w-56 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="w-20 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cost</th>
                {showTax ? (
                  <th className="w-36 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Tax
                  </th>
                ) : null}
                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const amount = (parseMoneyInput(line.quantity) ?? ZERO)
                  .times(parseMoneyInput(line.unitPrice) ?? ZERO)
                  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

                return (
                  <tr key={line.key} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <EntityPicker
                        kind="item"
                        options={items}
                        value={line.itemId || null}
                        onChange={(next) => chooseItem(line.key, next ?? '')}
                        placeholder="Item"
                        clearable
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <EntityPicker
                        options={expenseAccounts}
                        value={line.expenseAccountId || null}
                        onChange={(next) => update(line.key, { expenseAccountId: next ?? '' })}
                        placeholder="Uncategorised"
                        clearable
                      />
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
                        aria-label="Unit cost"
                        inputMode="decimal"
                        className="tabular text-right"
                        value={line.unitPrice}
                        onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                      />
                    </td>
                    {showTax ? (
                      <td className="px-2 py-1.5">
                        <NativeSelect
                          aria-label="Tax code"
                          value={line.taxCodeId}
                          onChange={(event) => update(line.key, { taxCodeId: event.target.value })}
                        >
                          <option value="">No tax</option>
                          {taxCodes.map((code) => (
                            <option key={code.id} value={code.id}>
                              {code.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                    ) : null}
                    <td className="tabular px-3 py-1.5 text-right">{formatMoney(amount, currency)}</td>
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
            onClick={() =>
              setLines((current) => [
                ...current,
                empty(
                  nextKey.current++,
                  vendors.find((v) => v.id === vendorId)?.defaultExpenseAccountId ?? '',
                ),
              ])
            }
          >
            <PlusIcon /> Add line
          </Button>

          <dl className="min-w-52 space-y-1 text-sm">
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular">{formatMoney(totals.subtotal, currency)}</dd>
            </div>
            {showTax ? (
              <div className="flex justify-between gap-8">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{formatMoney(totals.tax, currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-8 border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(totals.total, currency)}</dd>
            </div>
          </dl>
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/purchases/${config.slug}`)}>
          Cancel
        </Button>
        {config.posts ? (
          <SubmitButton variant="outline" disabled={!canSave} onClick={() => setSaveAsDraft(true)}>
            Save as draft
          </SubmitButton>
        ) : null}
        <SubmitButton disabled={!canSave} onClick={() => setSaveAsDraft(false)} pendingLabel="Saving…">
          {config.posts ? 'Save and post' : `Save ${config.singular.toLowerCase()}`}
        </SubmitButton>
      </div>

      <p className="text-right text-xs text-muted-foreground">{config.effect}</p>
    </form>
  )
}
