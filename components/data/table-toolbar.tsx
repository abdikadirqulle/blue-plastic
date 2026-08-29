'use client'

import { DownloadIcon, PrinterIcon } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Print and export, for a list.
 *
 * **Export is CSV, not `.xlsx`.** Excel opens it directly — the file carries a
 * byte-order mark and CRLF line endings for exactly that reason — and every
 * amount arrives as a number rather than as text, which is what people actually
 * want when they say "export to Excel". A real `.xlsx` would mean a spreadsheet
 * library in the bundle to produce a file that opens the same way.
 *
 * The export covers **every row the current filter matches**, not the page on
 * screen. Exporting page 2 of 7 is the kind of quiet wrongness that ends up in
 * somebody's board pack.
 *
 * Print uses the browser. `print.css` hides the chrome — sidebar, toolbar, row
 * menus — so the page prints as the table it is.
 */
export function TableToolbar({ exportHref }: { exportHref?: string }) {
  return (
    <div className="flex items-center gap-1 print:hidden">
      {exportHref ? (
        <a
          href={exportHref}
          download
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          title="Every row matching the current filter, as a CSV that Excel opens directly"
        >
          <DownloadIcon /> Export
        </a>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <PrinterIcon /> Print
      </Button>
    </div>
  )
}
