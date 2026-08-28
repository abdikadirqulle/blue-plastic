/**
 * Errors that are safe to show a user and stable enough to branch on.
 * Anything not thrown as an AppError is treated as a bug: logged with a
 * correlation id, surfaced as a generic message.
 */
export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL'

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: Record<string, string[]>

  constructor(code: AppErrorCode, message: string, details?: Record<string, string[]>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS[code]
    this.details = details
  }
}

export const unauthenticated = (m = 'You are not signed in.') => new AppError('UNAUTHENTICATED', m)
export const forbidden = (m = 'You do not have permission to do that.') => new AppError('FORBIDDEN', m)
export const notFound = (what = 'Record') => new AppError('NOT_FOUND', `${what} not found.`)
export const conflict = (m: string) => new AppError('CONFLICT', m)
export const validation = (m: string, details?: Record<string, string[]>) =>
  new AppError('VALIDATION', m, details)
export const precondition = (m: string) => new AppError('PRECONDITION_FAILED', m)

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
