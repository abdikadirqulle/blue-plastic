import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { ReceiveOrderButton, VoidPurchaseButton } from '@/components/purchases/purchase-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, toCalendarDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { purchaseBySlug } from '@/lib/purchase-types'
import { STATUS_LABELS, STATUS_VARIANTS } from '@/lib/sales-types'
import { requireOrgContext } from '@/server/auth/context'
import * as purchaseService from '@/server/services/purchase.service'

export const metadata: Metadata = { title: 'Document' }

export default async function PurchaseDocumentPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  const config = purchaseBySlug(type)
  if (!config) notFound()

  const ctx = await requireOrgContext('bill:read')
  const document = await purchaseService.get(ctx, id).catch(() => null)
  if (!document) notFound()

  const currency = ctx.organization.baseCurrency
  const canVoid =
    ctx.permissions.has('bill:void') && document.status !== 'VOID' && document.status !== 'DRAFT'
  const canReceive =
    config.type === 'PURCHASE_ORDER' &&
    ctx.permissions.has('bill:create') &&
    !document.convertedTo &&
    document.status !== 'VOID'

  return (
    <>
      <Link
        href={`/purchases/${config.slug}`}
        className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}
      >
        <ArrowLeftIcon /> {config.plural}
      </Link>

      <PageHeader
        title={`${config.singular} ${document.number}`}
        description={document.vendor.displayName}
        actions={
          <>
            {canReceive ? (
              <ReceiveOrderButton
                id={id}
                number={document.number}
                today={today(ctx.organization.timeZone)}
              />
            ) : null}
            {canVoid ? <VoidPurchaseButton id={id} number={document.number} /> : null}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Status">
          <Badge variant={STATUS_VARIANTS[document.status] ?? 'secondary'}>
            {STATUS_LABELS[document.status] ?? document.status}
          </Badge>
        </Detail>
        <Detail label="Date">{formatDate(toCalendarDate(document.date))}</Detail>
        {document.dueDate ? (
          <Detail label="Due">{formatDate(toCalendarDate(document.dueDate))}</Detail>
        ) : null}
        <Detail label="Total">
          <span className="tabular font-semibold">{formatMoney(document.total, currency)}</span>
        </Detail>
        {config.type === 'BILL' ? (
          <Detail label="Still owing">
            <span className="tabular font-semibold">{formatMoney(document.balance, currency)}</span>
          </Detail>
        ) : null}
        {document.reference ? <Detail label="Their reference">{document.reference}</Detail> : null}
      </div>

      {document.status === 'VOID' ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          Voided{document.voidReason ? ` — ${document.voidReason}` : ''}. Its entry was reversed; both
          remain in the ledger.
        </div>
      ) : null}

      {document.convertedTo ? (
        <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Became bill{' '}
          <Link href={`/purchases/bills/${document.convertedTo.id}`} className="font-medium underline underline-offset-4">
            {document.convertedTo.number}
          </Link>
          .
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="numeric w-20">Qty</TableHead>
              <TableHead className="numeric w-28">Cost</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead className="numeric w-32">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {document.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.description ?? line.item?.name ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {line.expenseAccount
                    ? `${line.expenseAccount.code} ${line.expenseAccount.name}`
                    : 'Uncategorised'}
                </TableCell>
                <TableCell className="numeric tabular">{Number(line.quantity)}</TableCell>
                <TableCell className="numeric tabular">{formatMoney(line.unitPrice, currency)}</TableCell>
                <TableCell className="text-muted-foreground">{line.taxCode?.name ?? '—'}</TableCell>
                <TableCell className="numeric tabular">{formatMoney(line.amount, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end border-t p-4">
          <dl className="min-w-56 space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(document.subtotal, currency)} />
            <Row label="Tax" value={formatMoney(document.taxTotal, currency)} />
            <Row label="Total" value={formatMoney(document.total, currency)} bold />
            {config.type === 'BILL' ? (
              <>
                <Row label="Paid" value={formatMoney(document.amountApplied, currency)} />
                <Row label="Still owing" value={formatMoney(document.balance, currency)} bold />
              </>
            ) : null}
          </dl>
        </div>
      </Card>

      {document.applications.length > 0 ? (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold">Settled by</div>
          <Table>
            <TableBody>
              {document.applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    {application.payment ? `Payment ${application.payment.number}` : null}
                    {application.creditDocument ? `Vendor credit ${application.creditDocument.number}` : null}
                  </TableCell>
                  <TableCell className="numeric tabular">
                    {formatMoney(application.amount, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {document.journal ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Posted as{' '}
          <Link href={`/journals/${document.journal.id}`} className="font-medium underline underline-offset-4">
            {document.journal.journalNumber}
          </Link>
          . Editing this document reverses that entry and posts a new one.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {config.posts ? 'Not posted to the ledger yet.' : config.effect}
        </p>
      )}
    </>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium">{children}</div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-8 ${bold ? 'border-t pt-1 font-semibold' : ''}`}>
      <dt className={bold ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}
