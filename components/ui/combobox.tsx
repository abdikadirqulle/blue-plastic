'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A record picker that is a text box.
 *
 * The control *is* the input: click it and type. There is no separate search
 * field inside a popup — a second box to find your way to is a step, and this is
 * the most-used control in the application. What the user sees is what they type
 * into, and the list underneath narrows as they go.
 *
 * When nothing matches, creating the record is the *first* row rather than the
 * last: at that point it is the only thing left to do, so it belongs under the
 * cursor and not below a list of near-misses.
 *
 * Written by hand rather than pulled from a library because the useful behaviour
 * when a record is missing is to create it without leaving the form — which makes
 * this application logic, not a generic widget. See ADR-0012.
 *
 * Keyboard behaviour is the point of it, so it is explicit: type to filter, ↑/↓
 * to move, Enter to choose, Escape to close and restore, Tab to leave,
 * Backspace on an empty box to clear the selection.
 */
export type ComboboxOption = {
  value: string
  label: string
  /** Shown on the right, and searched as well — an account code, a balance. */
  hint?: string
  disabled?: boolean
  group?: string
}

export type ComboboxProps = {
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  name?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  clearable?: boolean
  /**
   * Offered when the typed text matches nothing. Returning the new option's
   * value selects it; returning null leaves the box open.
   */
  onCreate?: (label: string) => Promise<string | null>
  createLabel?: (label: string) => string
}

const normalise = (value: string) => value.toLowerCase().normalize('NFKD')

type Row = { kind: 'option'; option: ComboboxOption } | { kind: 'create' }

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyMessage = 'Nothing found.',
  disabled,
  required,
  className,
  id,
  name,
  clearable,
  onCreate,
  createLabel = (label) => `Add “${label}”`,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const [creating, setCreating] = React.useState(false)

  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value) ?? null

  const filtered = React.useMemo(() => {
    const needle = normalise(query.trim())
    if (!needle) return options
    return options.filter(
      (option) =>
        normalise(option.label).includes(needle) ||
        (option.hint ? normalise(option.hint).includes(needle) : false),
    )
  }, [options, query])

  const canCreate =
    Boolean(onCreate) &&
    query.trim().length > 0 &&
    !options.some((option) => normalise(option.label) === normalise(query.trim()))

  // Create first, then the matches. One flat list, so the arrow keys and the
  // click handlers cannot disagree about what is highlighted.
  const rows: Row[] = [
    ...(canCreate ? [{ kind: 'create' as const }] : []),
    ...filtered
      .filter((option) => !option.disabled)
      .map((option) => ({ kind: 'option' as const, option })),
  ]

  /**
   * The list is rendered into the body, not next to the input. Every line table
   * in this application scrolls horizontally inside `overflow-x-auto` within an
   * `overflow-hidden` card, which would clip the list exactly where the picker
   * matters most — on an invoice line.
   */
  const [anchor, setAnchor] = React.useState<{
    top: number
    left: number
    width: number
    above: boolean
  }>()

  const place = React.useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return

    const below = window.innerHeight - rect.bottom
    const above = below < 280 && rect.top > below

    setAnchor({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      above,
    })
  }, [])

  function close(refocus = true) {
    setOpen(false)
    setQuery('')
    if (refocus) inputRef.current?.focus()
  }

  React.useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close(false)
    }

    // Any scroll moves the input, so the list has to move with it — capture,
    // because the scroll is usually on an ancestor rather than on the window.
    place()
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  })

  // Reset the highlight when the list changes, during render rather than in an
  // effect — an effect would paint the stale highlight once before correcting it.
  const listKey = `${open}|${query}`
  const [lastListKey, setLastListKey] = React.useState(listKey)
  if (listKey !== lastListKey) {
    setLastListKey(listKey)
    setActive(0)
  }

  React.useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function openList() {
    if (disabled || open) return
    setQuery('')
    setOpen(true)
  }

  function choose(row: Row) {
    if (row.kind === 'option') {
      onChange(row.option.value)
      close()
      return
    }

    if (!onCreate) return
    setCreating(true)
    void onCreate(query.trim())
      .then((created) => {
        if (created) {
          onChange(created)
          close()
        }
      })
      .finally(() => setCreating(false))
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault()
        openList()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, rows.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[active]
      if (row) choose(row)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      close(false)
    } else if (event.key === 'Backspace' && query === '' && value) {
      // Backspacing an empty box clears the selection, which is what every other
      // text field does and what makes this one feel like one.
      onChange(null)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(rows.length - 1)
    }
  }

  let renderedGroup: string | undefined

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {/* The real value, so an uncontrolled <form> submission still carries it. */}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      <div
        data-invalid={aria['aria-invalid'] ? 'true' : undefined}
        className={cn(
          'flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30',
          'data-[invalid=true]:border-destructive data-[invalid=true]:ring-destructive/20',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id ?? name ?? 'combobox'}-list`}
          aria-describedby={aria['aria-describedby']}
          aria-required={required}
          disabled={disabled}
          autoComplete="off"
          // Open: what is being typed. Closed: what is chosen.
          value={open ? query : (selected?.label ?? '')}
          placeholder={open && selected ? selected.label : placeholder}
          onChange={(event) => {
            if (!open) setOpen(true)
            setQuery(event.target.value)
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close the list' : 'Open the list'}
          onClick={() => (open ? close() : openList())}
          className="grid h-full w-9 shrink-0 place-items-center border-l text-muted-foreground"
        >
          <ChevronDownIcon className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: 'fixed',
                top: anchor.above ? undefined : anchor.top,
                bottom: anchor.above ? window.innerHeight - anchor.top : undefined,
                left: anchor.left,
                width: Math.max(anchor.width, 224),
              }}
              className={cn(
                'z-[60] overflow-hidden rounded-md border bg-popover shadow-md',
                'animate-in fade-in-0 zoom-in-95',
              )}
            >
              <div
                ref={listRef}
                id={`${id ?? name ?? 'combobox'}-list`}
                role="listbox"
                className="max-h-72 overflow-y-auto p-1"
              >
                {rows.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
                ) : null}

                {rows.map((row, index) => {
                  if (row.kind === 'create') {
                    return (
                      <button
                        key="__create"
                        type="button"
                        data-active={index === active}
                        disabled={creating}
                        onPointerEnter={() => setActive(index)}
                        onClick={() => choose(row)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm font-medium text-primary',
                          index === active ? 'bg-accent' : '',
                        )}
                      >
                        {creating ? (
                          <Loader2Icon className="size-4 shrink-0 animate-spin" />
                        ) : (
                          <PlusIcon className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{createLabel(query.trim())}</span>
                      </button>
                    )
                  }

                  const option = row.option
                  const heading = option.group && option.group !== renderedGroup ? option.group : null
                  if (heading) renderedGroup = option.group

                  return (
                    <React.Fragment key={option.value}>
                      {heading ? (
                        <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground/70">
                          {heading}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.value === value}
                        data-active={index === active}
                        onPointerEnter={() => setActive(index)}
                        onClick={() => choose(row)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                          index === active ? 'bg-accent text-accent-foreground' : '',
                        )}
                      >
                        <CheckIcon
                          className={cn(
                            'size-4 shrink-0',
                            option.value === value ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="shrink-0 text-xs tabular text-muted-foreground">
                            {option.hint}
                          </span>
                        ) : null}
                      </button>
                    </React.Fragment>
                  )
                })}

                {clearable && value ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null)
                      close()
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-sm border-t px-2 py-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="size-4 shrink-0" />
                    Clear selection
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
