'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2Icon } from 'lucide-react'

import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'

/**
 * Who the statement is for.
 *
 * A statement is always *about somebody*, so the picker is part of the report
 * rather than a step before it. Choosing writes to the URL, which means a
 * statement can be sent to a colleague as a link and be the same statement.
 */
export function StatementPicker({
  label,
  param,
  value,
  options,
}: {
  label: string
  /** The query parameter this picker writes: customerId, vendorId, accountId. */
  param: string
  value: string | null
  options: { value: string; label: string; hint?: string; group?: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-1.5">
      <Label htmlFor={param}>
        {label}
        {pending ? <Loader2Icon className="ml-1.5 inline size-3 animate-spin" /> : null}
      </Label>
      <Combobox
        id={param}
        className="w-72"
        options={options}
        value={value}
        placeholder={`Choose a ${label.toLowerCase()}`}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams)
          if (next) params.set(param, next)
          else params.delete(param)
          startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
        }}
      />
    </div>
  )
}
