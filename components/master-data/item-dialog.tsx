'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangleIcon, PackageIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { idleState } from '@/components/forms/action-state'
import { Field, fieldProps } from '@/components/forms/field'
import { FormError } from '@/components/forms/form-error'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { createItemForm, updateItemForm } from '@/app/(app)/items/actions'
import type { ItemType } from '@prisma/client'

export type ItemValues = {
  id?: string
  sku?: string | null
  name?: string | null
  description?: string | null
  type?: ItemType
  unitOfMeasure?: string | null
  salesDescription?: string | null
  salesPrice?: string | null
  incomeAccountId?: string | null
  isTaxable?: boolean
  salesTaxCodeId?: string | null
  purchaseDescription?: string | null
  purchaseCost?: string | null
  expenseAccountId?: string | null
  inventoryAccountId?: string | null
  cogsAccountId?: string | null
  reorderPoint?: string | null
  categoryId?: string | null
}

export type AccountOption = { id: string; label: string; type: string; subtype: string }
export type SimpleOption = { id: string; label: string }

const TYPE_HELP: Record<ItemType, string> = {
  SERVICE: 'Labour or a service. Needs an income account only. No stock is tracked.',
  NON_INVENTORY:
    'Goods bought and resold without tracking stock levels. Selling one will NOT reduce any stock figure and posts no cost — the purchase was expensed when you bought it.',
  INVENTORY:
    'Goods with tracked quantity and cost. Selling one moves inventory and posts cost of goods sold in the same journal as the sale.',
}

/** Cannot be changed later, so it is worth being blunt about at the moment of choosing. */
const TYPE_WARNING: Partial<Record<ItemType, string>> = {
  SERVICE: 'Stock is never tracked for a service. This cannot be changed later.',
  NON_INVENTORY:
    'This item will not appear on the Inventory screen and its quantity will never change, however many you sell. If you want to count this one, choose Inventory product — the type cannot be changed after the item is created.',
}

export function NewItemButton(props: {
  accounts: AccountOption[]
  taxCodes: SimpleOption[]
  categories: SimpleOption[]
  currency: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> New item
      </Button>
      {open ? <ItemDialog {...props} mode="create" onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export function ItemDialog({
  mode,
  item,
  accounts,
  taxCodes,
  categories,
  currency,
  onClose,
  defaultName,
  onCreated,
}: {
  mode: 'create' | 'edit'
  item?: ItemValues
  accounts: AccountOption[]
  taxCodes: SimpleOption[]
  categories: SimpleOption[]
  currency: string
  onClose: () => void
  /** Pre-fills the name, when the dialog was opened by typing one into a picker. */
  defaultName?: string
  /** Hands the new record back to whatever opened this. */
  onCreated?: (record: { id: string; label: string }) => void
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    mode === 'create' ? createItemForm : updateItemForm,
    idleState,
  )
  const [type, setType] = useState<ItemType>(item?.type ?? 'NON_INVENTORY')
  const handled = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && !handled.current) {
      handled.current = true
      toast.success(state.message ?? 'Saved.')
      if (state.created) onCreated?.({ id: state.created.id, label: state.created.label ?? '' })
      router.refresh()
      onClose()
    }
    if (state.status !== 'success') handled.current = false
  }, [state, router, onClose, onCreated])

  const income = accounts.filter((a) => a.type === 'REVENUE')
  const expense = accounts.filter((a) => a.type === 'EXPENSE')
  const inventory = accounts.filter((a) => a.subtype === 'INVENTORY')
  const e = state.fieldErrors

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New item' : `Edit ${item?.name}`}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="mt-4 space-y-5">
          <FormError message={state.message} />
          {item?.id ? <input type="hidden" name="id" value={item.id} /> : null}
          {mode === 'edit' ? <input type="hidden" name="type" value={type} /> : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field name="name" label="Name" required error={e?.name}>
              <Input
                {...fieldProps('name', e?.name)}
                defaultValue={item?.name ?? defaultName ?? ''}
                autoFocus
                required
              />
            </Field>
            <Field name="sku" label="SKU" error={e?.sku}>
              <Input {...fieldProps('sku', e?.sku)} defaultValue={item?.sku ?? ''} />
            </Field>
          </div>

          <Field name="type" label="Type" hint={TYPE_HELP[type]} required error={e?.type}>
            {mode === 'create' ? (
              <NativeSelect
                {...fieldProps('type', e?.type, true)}
                value={type}
                onChange={(event) => setType(event.target.value as ItemType)}
              >
                <option value="SERVICE">Service</option>
                <option value="NON_INVENTORY">Non-inventory product</option>
                <option value="INVENTORY">Inventory product</option>
              </NativeSelect>
            ) : (
              <Input
                id="type"
                value={
                  type === 'SERVICE' ? 'Service' : type === 'INVENTORY' ? 'Inventory product' : 'Non-inventory product'
                }
                disabled
                readOnly
                aria-describedby="type-hint"
              />
            )}
          </Field>

          {mode === 'create' && TYPE_WARNING[type] ? (
            <p className="-mt-2 flex gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-muted-foreground">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>{TYPE_WARNING[type]}</span>
            </p>
          ) : null}

          {type === 'INVENTORY' ? (
            <p className="-mt-2 flex gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <PackageIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                This item starts at <strong>zero on hand</strong>. There is no opening-quantity box on
                purpose: stock only exists where the ledger says it does. Put stock in by entering the bill
                or expense you bought it on, or — if you are setting up books that already have stock — by
                recording a stock adjustment for the count and its cost.
              </span>
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="categoryId" label="Category" error={e?.categoryId}>
              <NativeSelect
                {...fieldProps('categoryId', e?.categoryId)}
                defaultValue={item?.categoryId ?? ''}
              >
                <option value="">— none —</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field name="unitOfMeasure" label="Unit" error={e?.unitOfMeasure}>
              <Input
                {...fieldProps('unitOfMeasure', e?.unitOfMeasure)}
                defaultValue={item?.unitOfMeasure ?? ''}
                placeholder="kg, piece, roll"
              />
            </Field>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Selling</p>

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field name="salesPrice" label={`Price (${currency})`} error={e?.salesPrice}>
                <Input
                  {...fieldProps('salesPrice', e?.salesPrice)}
                  inputMode="decimal"
                  className="tabular"
                  defaultValue={item?.salesPrice ?? ''}
                />
              </Field>
              <Field
                name="incomeAccountId"
                label="Income account"
                hint="Where revenue from this item is posted."
                required
                error={e?.incomeAccountId}
              >
                <NativeSelect
                  {...fieldProps('incomeAccountId', e?.incomeAccountId, true)}
                  defaultValue={item?.incomeAccountId ?? ''}
                >
                  <option value="">— choose —</option>
                  {income.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field name="salesTaxCodeId" label="Default sales tax" error={e?.salesTaxCodeId}>
              <NativeSelect
                {...fieldProps('salesTaxCodeId', e?.salesTaxCodeId)}
                defaultValue={item?.salesTaxCodeId ?? ''}
              >
                <option value="">— none —</option>
                {taxCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Buying</p>

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field name="purchaseCost" label={`Cost (${currency})`} error={e?.purchaseCost}>
                <Input
                  {...fieldProps('purchaseCost', e?.purchaseCost)}
                  inputMode="decimal"
                  className="tabular"
                  defaultValue={item?.purchaseCost ?? ''}
                />
              </Field>

              {type === 'INVENTORY' ? (
                <Field
                  name="cogsAccountId"
                  label="Cost of goods sold account"
                  hint="Posted in the same journal as the sale, so gross margin is right on the day."
                  required
                  error={e?.cogsAccountId}
                >
                  <NativeSelect
                    {...fieldProps('cogsAccountId', e?.cogsAccountId, true)}
                    defaultValue={item?.cogsAccountId ?? ''}
                  >
                    <option value="">— choose —</option>
                    {expense.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                <Field name="expenseAccountId" label="Expense account" error={e?.expenseAccountId}>
                  <NativeSelect
                    {...fieldProps('expenseAccountId', e?.expenseAccountId)}
                    defaultValue={item?.expenseAccountId ?? ''}
                  >
                    <option value="">— none —</option>
                    {expense.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </div>

            {type === 'INVENTORY' ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field
                  name="inventoryAccountId"
                  label="Inventory account"
                  hint="Where the value of stock on hand is held."
                  required
                  error={e?.inventoryAccountId}
                >
                  <NativeSelect
                    {...fieldProps('inventoryAccountId', e?.inventoryAccountId, true)}
                    defaultValue={item?.inventoryAccountId ?? ''}
                  >
                    <option value="">— choose —</option>
                    {inventory.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field name="reorderPoint" label="Reorder at" error={e?.reorderPoint}>
                  <Input
                    {...fieldProps('reorderPoint', e?.reorderPoint)}
                    inputMode="decimal"
                    className="tabular"
                    defaultValue={item?.reorderPoint ?? ''}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <Field name="description" label="Description" error={e?.description}>
            <Input {...fieldProps('description', e?.description)} defaultValue={item?.description ?? ''} />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">
              {mode === 'create' ? 'Create item' : 'Save changes'}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
