'use client'

import { AlertTriangleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
      <AlertTriangleIcon className="size-8 text-destructive/70" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          The page could not be loaded. Nothing was changed.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Reference <span className="tabular">{error.digest}</span>
          </p>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
