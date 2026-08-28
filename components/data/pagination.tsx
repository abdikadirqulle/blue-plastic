import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Pagination is URL state, not component state: the page you are on survives a
 * refresh, a shared link and the back button.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  basePath: string
  params?: Record<string, string | undefined>
}) {
  if (total === 0) return null

  const href = (target: number) => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) if (v) search.set(k, v)
    if (target > 1) search.set('page', String(target))
    const qs = search.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">
        <span className="tabular">{from}</span>–<span className="tabular">{to}</span> of{' '}
        <span className="tabular">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} rel="prev">
            <ChevronLeftIcon /> Previous
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}>
            <ChevronLeftIcon /> Previous
          </span>
        )}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} rel="next">
            Next <ChevronRightIcon />
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}>
            Next <ChevronRightIcon />
          </span>
        )}
      </div>
    </div>
  )
}
