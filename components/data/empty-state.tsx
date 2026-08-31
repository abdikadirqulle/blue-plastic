import type { LucideIcon } from 'lucide-react'

/**
 * An empty state exists to tell the user what to do next, so the primary action
 * lives inside it rather than only in a toolbar they have already scanned past.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-card px-6 py-14 text-center">
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
