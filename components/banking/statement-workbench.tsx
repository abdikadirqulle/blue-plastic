'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, UploadIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDate, toCalendarDate } from '@/lib/date'
import { Decimal, formatMoney } from '@/lib/money'
import {
  excludeTransaction,
  matchTransaction,
  previewStatement,
  runStatementImport,
  suggestionsFor,
} from '@/app/(app)/banking/actions'

type Transaction = {
  id: string
  date: string
  description: string
  reference: string | null
  amount: string
  status: string
  matchedTo: string | null
  matchedJournalId: string | null
}

type Suggestion = {
  journalLineId: string
  journalNumber: string
  date: string
  description: string | null
  amount: string
  dayGap: number
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

/**
 * Importing a statement, then deciding what each line is.
 *
 * Suggestions require an **exact** amount match within a few days. A near-match is
 * not a match — it is two different transactions, and offering it would let a
 * reconciliation quietly bury a real discrepancy.
 */
export function StatementWorkbench({
  accounts,
  accountId,
  columns,
  currency,
  transactions,
}: {
  accounts: { id: string; label: string }[]
  accountId: string
  columns: { name: string; required: boolean; aliases: string }[]
  currency: string
  transactions: Transaction[]
}) {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<{
    total: number
    ready: number
    duplicates: number
    issues: { row: number; message: string }[]
    sample: { date: string; description: string; amount: string }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isPending, startTransition] = useTransition()

  const pending = transactions.filter((t) => t.status === 'PENDING')
  const done = transactions.filter((t) => t.status !== 'PENDING')

  const openSuggestions = (id: string) => {
    setOpenFor(id)
    setSuggestions([])
    startTransition(async () => setSuggestions(await suggestionsFor(id)))
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
          <div>
            <label htmlFor="account" className="mb-1.5 block text-sm font-medium">
              Account
            </label>
            <select
              id="account"
              value={accountId}
              onChange={(event) => router.push(`/banking/import?account=${event.target.value}`)}
              className={selectClass}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="statement-file" className="mb-1.5 block text-sm font-medium">
              Statement CSV
            </label>
            <input
              id="statement-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  setCsv(String(reader.result ?? ''))
                  setPreview(null)
                }
                reader.readAsText(file)
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
        </div>

        <details className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Columns it understands</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {columns.map((column) => (
              <li key={column.name}>
                <span className="font-medium text-foreground">{column.name}</span>
                {column.required ? <span className="text-destructive"> (required)</span> : null}
                {column.aliases ? <span> — {column.aliases}</span> : null}
              </li>
            ))}
          </ul>
        </details>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="mt-4 space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2Icon className="size-4" />
                <span className="tabular font-medium">{preview.ready}</span> new
              </span>
              {preview.duplicates > 0 ? (
                <span className="text-muted-foreground">
                  <span className="tabular font-medium">{preview.duplicates}</span> already imported
                </span>
              ) : null}
              {preview.issues.length > 0 ? (
                <span className="flex items-center gap-1.5 text-warning-foreground dark:text-warning">
                  <AlertTriangleIcon className="size-4" />
                  <span className="tabular font-medium">{preview.issues.length}</span> unreadable
                </span>
              ) : null}
            </div>
            {preview.sample.length > 0 ? (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {preview.sample.map((row, index) => (
                  <li key={index}>
                    <span className="tabular">{row.date}</span> — {row.description}{' '}
                    <span className="tabular">{row.amount}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {preview ? (
            <Button
              disabled={isPending || preview.ready === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await runStatementImport({ accountId, csv })
                  if (result.ok) {
                    toast.success(`${result.data.imported} lines imported.`)
                    setPreview(null)
                    setCsv('')
                    router.refresh()
                  } else {
                    setError(result.error.message)
                  }
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              Import {preview.ready} lines
            </Button>
          ) : (
            <Button
              disabled={isPending || csv === '' || accountId === ''}
              onClick={() =>
                startTransition(async () => {
                  setError(null)
                  const result = await previewStatement({ accountId, csv })
                  if (result.ok) setPreview(result.data)
                  else setError(result.error.message)
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              Check the file
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold">
          To deal with ({pending.length})
        </div>
        {pending.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y">
            {pending.map((transaction) => (
              <li key={transaction.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular w-24 shrink-0 text-xs text-muted-foreground">
                    {formatDate(toCalendarDate(new Date(transaction.date)))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{transaction.description}</span>
                  <span
                    className={`tabular shrink-0 text-sm font-medium ${
                      new Decimal(transaction.amount).isNegative() ? 'text-destructive' : ''
                    }`}
                  >
                    {formatMoney(transaction.amount, currency)}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => openSuggestions(transaction.id)}>
                    Find a match
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Set aside"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await excludeTransaction({ importedId: transaction.id })
                        if (result.ok) router.refresh()
                        else toast.error(result.error.message)
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </div>

                {openFor === transaction.id ? (
                  <div className="mt-2 rounded-md border bg-muted/30 p-2">
                    {isPending && suggestions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Looking…</p>
                    ) : suggestions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing in the books matches this exactly within a week. Enter it as a payment,
                        expense or transfer, then come back.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {suggestions.map((suggestion) => (
                          <li key={suggestion.journalLineId} className="flex items-center gap-2 text-xs">
                            <span className="tabular w-20 text-muted-foreground">
                              {formatDate(toCalendarDate(new Date(suggestion.date)))}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {suggestion.description ?? suggestion.journalNumber}
                            </span>
                            <span className="tabular">{formatMoney(suggestion.amount, currency)}</span>
                            <span className="text-muted-foreground">
                              {suggestion.dayGap === 0 ? 'same day' : `${suggestion.dayGap}d apart`}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await matchTransaction({
                                    importedId: transaction.id,
                                    journalLineId: suggestion.journalLineId,
                                  })
                                  if (result.ok) {
                                    toast.success('Matched.')
                                    setOpenFor(null)
                                    router.refresh()
                                  } else {
                                    toast.error(result.error.message)
                                  }
                                })
                              }
                            >
                              Match
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold">Dealt with ({done.length})</div>
          <ul className="divide-y">
            {done.map((transaction) => (
              <li key={transaction.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="tabular w-24 shrink-0 text-xs text-muted-foreground">
                  {formatDate(toCalendarDate(new Date(transaction.date)))}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{transaction.description}</span>
                <span className="tabular shrink-0 text-sm">
                  {formatMoney(transaction.amount, currency)}
                </span>
                {transaction.status === 'MATCHED' && transaction.matchedJournalId ? (
                  <Link
                    href={`/journals/${transaction.matchedJournalId}`}
                    className="text-xs underline-offset-4 hover:underline"
                  >
                    <Badge variant="success">{transaction.matchedTo}</Badge>
                  </Link>
                ) : (
                  <Badge variant="outline">set aside</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
