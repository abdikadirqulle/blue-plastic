'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  quickCreateCustomer,
  quickCreateItem,
  quickCreateVendor,
} from '@/app/(app)/quick-create/actions'

export type PickerOption = { id: string; label: string; hint?: string; group?: string }

const CREATORS = {
  customer: { action: quickCreateCustomer, noun: 'Customer' },
  vendor: { action: quickCreateVendor, noun: 'Vendor' },
  item: { action: quickCreateItem, noun: 'Item' },
} as const

export type CreatableKind = keyof typeof CREATORS

/**
 * A searchable picker for a list of records.
 *
 * `kind` decides whether the list can be added to from inside the form. Accounts
 * are deliberately not creatable this way: an account needs a type and a subtype
 * that determine where it lands on the balance sheet, and guessing those from a
 * name typed into a dropdown is how a chart of accounts becomes a mess.
 *
 * The new record is selected immediately and the router is refreshed, so the
 * rest of the form — a tax code defaulted from the customer, say — sees it too.
 */
export function EntityPicker({
  options,
  value,
  onChange,
  kind,
  name,
  id,
  placeholder,
  emptyMessage,
  clearable,
  disabled,
  required,
  error,
  className,
}: {
  options: PickerOption[]
  value: string | null
  onChange: (value: string | null) => void
  /** Omit to make the list search-only. */
  kind?: CreatableKind
  name?: string
  id?: string
  placeholder?: string
  emptyMessage?: string
  clearable?: boolean
  disabled?: boolean
  required?: boolean
  error?: string[]
  className?: string
}) {
  const router = useRouter()
  const [extra, setExtra] = React.useState<PickerOption[]>([])

  const merged: ComboboxOption[] = React.useMemo(
    () =>
      [...extra, ...options]
        // A quick-created record appears here immediately; after the refresh the
        // server list contains it too, and the duplicate has to go.
        .filter(
          (option, index, all) => all.findIndex((other) => other.id === option.id) === index,
        )
        .map((option) => ({
          value: option.id,
          label: option.label,
          hint: option.hint,
          group: option.group,
        })),
    [options, extra],
  )

  const onCreate = kind
    ? async (label: string) => {
        const result = await CREATORS[kind].action({ name: label })
        if (!result.ok) {
          toast.error(result.error.message)
          return null
        }

        setExtra((current) => [{ id: result.data.id, label: result.data.label }, ...current])
        toast.success(`${CREATORS[kind].noun} “${result.data.label}” created.`)
        router.refresh()
        return result.data.id
      }
    : undefined

  return (
    <Combobox
      options={merged}
      value={value}
      onChange={onChange}
      name={name}
      id={id}
      placeholder={placeholder}
      emptyMessage={emptyMessage ?? (kind ? 'No match. Type a name to create one.' : 'Nothing found.')}
      clearable={clearable}
      disabled={disabled}
      required={required}
      aria-invalid={error?.length ? true : undefined}
      aria-describedby={error?.length ? `${name ?? id}-error` : undefined}
      className={className}
      onCreate={onCreate}
      createLabel={(label) => `Add “${label}”`}
    />
  )
}
