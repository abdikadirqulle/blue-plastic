import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * One field, one label, one error slot. Errors are addressed by id and wired via
 * aria-describedby so a screen reader announces them, which is not optional in a
 * form people enter money into.
 */
export function Field({
  name,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  name: string
  label: string
  hint?: string
  error?: string[]
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  const errorId = `${name}-error`
  const hintId = `${name}-hint`

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive" aria-hidden>*</span> : null}
      </Label>
      {children}
      {hint && !error?.length ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error?.length ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : null}
    </div>
  )
}

/** Props to spread onto the input so labels, hints and errors are correctly linked. */
export function fieldProps(name: string, error?: string[], hasHint = false) {
  return {
    id: name,
    name,
    'aria-invalid': error?.length ? true : undefined,
    'aria-describedby': error?.length ? `${name}-error` : hasHint ? `${name}-hint` : undefined,
  }
}
