/**
 * Typed fetch for the client-side surfaces that legitimately need one
 * (typeahead search, infinite registers). Page data does not come through here —
 * Server Components call the service layer directly (ADR-0004).
 */
export type ApiError = { code: string; message: string; details?: Record<string, string[]> }

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly body: ApiError) {
    super(body.message)
    this.name = 'ApiRequestError'
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }

  const response = await fetch(url.pathname + url.search, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: ApiError } | null
    throw new ApiRequestError(
      response.status,
      body?.error ?? { code: 'INTERNAL', message: 'Request failed.' },
    )
  }

  return response.json() as Promise<T>
}
