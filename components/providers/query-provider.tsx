'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * TanStack Query, mounted only where it is used.
 *
 * Exactly one screen needs a client-side cache: the activity log, which is an
 * infinite list the user scrolls without navigating (ADR-0004). Keeping the
 * provider in the root layout put the whole library into the first load of every
 * other page, none of which call it.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
