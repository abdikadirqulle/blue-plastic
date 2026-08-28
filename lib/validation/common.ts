import { z } from 'zod'

export const cuid = z.string().min(1, 'Required')

export const trimmed = (max: number) => z.string().trim().max(max)

export const requiredText = (label: string, max = 255) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`)

export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

/**
 * Passwords are checked for length and variety, not for a punctuation ritual.
 * Length is what actually resists guessing.
 */
export const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200, 'Password must be 200 characters or fewer')

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, 'Use a 3-letter ISO currency code')

export const countryCode = z.string().trim().toUpperCase().length(2).nullable().optional()

/** Money crosses the wire as a decimal string, never a float (ADR-0003). */
export const moneyString = z
  .string()
  .trim()
  .regex(/^-?\d{1,15}(\.\d{1,4})?$/, 'Enter a valid amount')

export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')

/** Shared list-query shape. Every paginated route parses through this. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

export type ListQuery = z.infer<typeof listQuerySchema>

export function parseListQuery(params: Record<string, string | string[] | undefined>): ListQuery {
  const flat: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? v[0] : v
  const result = listQuerySchema.safeParse(flat)
  return result.success ? result.data : listQuerySchema.parse({})
}

export function paginate(query: ListQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
}

export type Paged<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export function paged<T>(rows: T[], total: number, query: ListQuery): Paged<T> {
  return {
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  }
}
