import { TableSkeleton } from '@/components/data/table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function SalesLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <TableSkeleton rows={10} columns={6} />
    </div>
  )
}
