import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, PackageIcon, PencilIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { ReceiveOrderButton } from '@/components/purchases/purchase-actions'
import { DisposeButton } from '@/components/data/document-disposal'
import { dispositionOf } from '@/lib/document-disposition'
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
  // A draft or a purchase order can now be deleted, so the control shows for
  // those too — what it does is decided by `disposition` below.
  const canVoid = ctx.permissions.has('bill:void') && document.status !== 'VOID'

  // The same rule the service enforces: no editing a voided document, or one
  // with a payment or credit already applied to it.
  const canEdit =
    ctx.permissions.has('bill:update') && document.status !== 'VOID' && document.applications.length === 0
  const canReceive =
    config.type === 'PURCHASE_ORDER' &&
    ctx.permissions.has('bill:create') &&
    !document.convertedTo &&
    document.status !== 'VOID'

  const disposition = dispositionOf({
    status: document.status,
    journalId: document.journalId,
    convertedToId: document.convertedTo?.id ?? null,
    appliedCount: document.applications.length,
  })

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
            {canEdit ? (
              <Link
                href={`/purchases/${config.slug}/${id}/edit`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <PencilIcon /> Edit
              </Link>
            ) : null}
            {canVoid ? (
              <DisposeButton
                kind="purchase"
                id={id}
                number={document.number}
                disposition={disposition}
                redirectTo={disposition.action === 'delete' ? `/purchases/${config.slug}` : undefined}
              />
            ) : null}
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
        {/*
          Where the money came from. An expense is settled the moment it is
          entered, so the account it left is the most useful thing on the
          document after the total — and it was not shown anywhere.
        */}
        {document.paymentAccount ? (
          <Detail label="Paid from">
            <Link
              href={`/accounts/${document.paymentAccount.id}`}
              className="underline-offset-4 hover:underline"
            >
              <span className="tabular text-muted-foreground">{document.paymentAccount.code}</span>{' '}
              {document.paymentAccount.name}
            </Link>
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
              <TableHead>Category or product</TableHead>
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
                  {/*
                    A line is one thing or the other. An item line shows the
                    product, because that is what was chosen and where its account
                    came from; a category line shows the account.
                  */}
                  {line.item ? (
                    <span className="inline-flex items-center gap-1.5">
                      <PackageIcon className="size-3" /> {line.item.name}
                    </span>
                  ) : line.expenseAccount ? (
                    `${line.expenseAccount.code} ${line.expenseAccount.name}`
                  ) : (
                    'Uncategorised'
                  )}
                </TableCell>
                <TableCell className="numeric tabular">
                  {line.item ? Number(line.quantity) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="numeric tabular">
                  {line.item ? (
                    formatMoney(line.unitPrice, currency)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
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
          <div className="panel-head text-sm font-semibold">Settled by</div>
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
