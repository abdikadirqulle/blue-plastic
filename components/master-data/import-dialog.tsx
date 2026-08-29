'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { previewImport, runImport } from '@/app/(app)/customers/actions'
import type { ContactSide } from './contact-dialog'

type Preview = {
  total: number
  ready: number
  skipped: number
  issues: { row: number; field?: string; message: string }[]
  sample: { row: number; displayName: string; email: string; balance: string }[]
  imported?: number
}

/**
 * Import always previews first. A file of customers is exactly the kind of thing
 * nobody checks afterwards, so the only honest flow is to say what will happen,
 * what will be skipped and why, before anything is written.
 */
export function ImportDialog({ side, columns }: { side: ContactSide; columns: { name: string; required: boolean; aliases: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const noun = side === 'customer' ? 'customers' : 'vendors'

  const reset = () => {
    setCsv('')
    setPreview(null)
    setError(null)
    setOpen(false)
  }

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(String(reader.result ?? ''))
      setPreview(null)
    }
    reader.readAsText(file)
  }

  const check = () =>
    startTransition(async () => {
      setError(null)
      const result = await previewImport({ csv, side })
      if (result.ok) setPreview(result.data)
      else setError(result.error.message)
    })

  const commit = () =>
    startTransition(async () => {
      setError(null)
      const result = await runImport({ csv, side })
      if (result.ok) {
        toast.success(`${result.data.imported} ${noun} imported.`)
        router.refresh()
        reset()
      } else {
        setError(result.error.message)
      }
    })

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UploadIcon /> Import
      </Button>
    )
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) reset() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import {noun}</DialogTitle>
        </DialogHeader>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV exported from a spreadsheet. Nothing is written until you have seen what will
          happen.
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="csv-file" className="mb-1.5 block text-sm font-medium">
              CSV file
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) readFile(file)
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>

          <details className="rounded-md border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Columns it understands</summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {columns.map((column) => (
                <li key={column.name}>
                  <span className="font-medium text-foreground">{column.name}</span>
                  {column.required ? <span className="text-destructive"> (required)</span> : null}
                  {column.aliases ? <span> — also accepts: {column.aliases}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Column names are matched loosely: case, spaces and underscores are ignored.
            </p>
          </details>

          {preview ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2Icon className="size-4" />
                  <span className="tabular font-medium">{preview.ready}</span> ready
                </span>
                {preview.skipped > 0 ? (
                  <span className="flex items-center gap-1.5 text-warning-foreground dark:text-warning">
                    <AlertTriangleIcon className="size-4" />
                    <span className="tabular font-medium">{preview.skipped}</span> skipped
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  of <span className="tabular">{preview.total}</span> rows
                </span>
              </div>

              {preview.sample.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded border">
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.sample.map((row) => (
                        <tr key={row.row} className="border-b last:border-0">
                          <td className="tabular px-2 py-1 text-muted-foreground">{row.row}</td>
                          <td className="px-2 py-1 font-medium">{row.displayName}</td>
                          <td className="px-2 py-1 text-muted-foreground">{row.email}</td>
                          <td className="tabular px-2 py-1 text-right">{row.balance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {preview.issues.length > 0 ? (
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {preview.issues.map((issue, index) => (
                    <p key={index} className="text-muted-foreground">
                      <span className="tabular font-medium text-foreground">Row {issue.row}</span>
                      {issue.field ? <span> · {issue.field}</span> : null} — {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={reset} disabled={isPending}>
            Cancel
          </Button>
          {preview ? (
            <Button onClick={commit} disabled={isPending || preview.ready === 0}>
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              Import {preview.ready} {noun}
            </Button>
          ) : (
            <Button onClick={check} disabled={isPending || csv === ''}>
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              Check the file
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
