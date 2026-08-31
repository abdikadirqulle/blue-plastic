'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'

/**
 * Pushes the query into the URL, debounced, so the server re-renders the list.
 * Deliberately not a client-side filter: the table is paginated on the server
 * and filtering only the current page would quietly lie about the results.
 */
export function SearchInput({ placeholder = 'Search…' }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (value === current) return

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString())
      if (value) next.set('q', value)
      else next.delete('q')
      next.delete('page')
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
    }, 300)

    return () => clearTimeout(timer)
  }, [value, searchParams, pathname, router])

  return (
    <div className="relative w-full max-w-xs">
      <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-busy={isPending}
        className="pl-7"
      />
    </div>
  )
}
