import { TableSkeleton } from '@/components/data/table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The reports are the slowest screens in the application — they aggregate the
 * whole ledger — so they are the ones that most need to show their shape before
 * the figures arrive. The control bar is drawn at its real height so nothing
 * moves when the report lands.
 */
export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {[44, 40, 40, 36].map((width, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9" style={{ width: `${width * 4}px` }} />
          </div>
        ))}
      </div>
      <TableSkeleton rows={10} columns={4} />
    </div>
  )
}
