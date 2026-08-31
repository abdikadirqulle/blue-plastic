import { notFound } from 'next/navigation'

import { formatDate, toCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { bySlug } from '@/lib/sales-types'
import { requireOrgContext } from '@/server/auth/context'
import * as organizationService from '@/server/services/organization.service'
import * as salesService from '@/server/services/sales.service'
import { PrintButton } from './print-button'

export const metadata = { title: 'Print' }

/**
 * The customer-facing document.
 *
 * Printed by the browser rather than rendered to a PDF on the server: it prints
 * correctly, saves to PDF from the same dialog on every platform, needs no
 * headless browser in the deployment, and keeps the layout in CSS where it can
 * be changed without a release.
 */
export default async function PrintDocumentPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  const config = bySlug(type)
  if (!config) notFound()

  const ctx = await requireOrgContext('invoice:read')
  const [document, organization] = await Promise.all([
    salesService.get(ctx, id).catch(() => null),
    organizationService.get(ctx),
  ])
  if (!document) notFound()

  const currency = ctx.organization.baseCurrency
  const customer = document.customer

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <article className="rounded-md border bg-card p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div>
            <h1 className="text-lg font-semibold">{organization.legalName ?? organization.name}</h1>
            <address className="mt-1 text-sm not-italic text-muted-foreground">
              {[organization.addressLine1, organization.addressLine2]
                .filter(Boolean)
                .map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              <span className="block">
                {[organization.city, organization.region, organization.postalCode]
                  .filter(Boolean)
                  .join(' ')}
              </span>
              {organization.taxRegistrationNumber ? (
                <span className="mt-1 block">Tax reg. {organization.taxRegistrationNumber}</span>
              ) : null}
            </address>
          </div>

          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{config.singular}</p>
            <p className="tabular mt-1 text-sm">{document.number}</p>
            <p className="tabular mt-3 text-sm text-muted-foreground">
              {formatDate(toCalendarDate(document.date))}
            </p>
            {document.dueDate ? (
              <p className="tabular text-sm text-muted-foreground">
                Due {formatDate(toCalendarDate(document.dueDate))}
              </p>
            ) : null}
          </div>
        </header>

        <section className="flex flex-wrap justify-between gap-6 py-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">To</p>
            <p className="mt-1 font-medium">{customer.displayName}</p>
            <address className="text-sm not-italic text-muted-foreground">
              {customer.billingLine1 ? <span className="block">{customer.billingLine1}</span> : null}
              {customer.billingCity ? <span className="block">{customer.billingCity}</span> : null}
              {customer.email ? <span className="block">{customer.email}</span> : null}
            </address>
          </div>
          {document.reference ? (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your reference
              </p>
              <p className="mt-1 text-sm">{document.reference}</p>
            </div>
          ) : null}
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y">
              <th className="py-2 text-left font-medium">Description</th>
              <th className="w-20 py-2 text-right font-medium">Qty</th>
              <th className="w-28 py-2 text-right font-medium">Price</th>
              <th className="w-28 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="py-2">{line.description ?? line.item?.name ?? ''}</td>
                <td className="tabular py-2 text-right">{Number(line.quantity)}</td>
                <td className="tabular py-2 text-right">{formatMoney(line.unitPrice, currency)}</td>
                <td className="tabular py-2 text-right">{formatMoney(line.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="min-w-60 space-y-1 text-sm">
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular">{formatMoney(document.subtotal, currency)}</dd>
            </div>
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular">{formatMoney(document.taxTotal, currency)}</dd>
            </div>
            <div className="flex justify-between gap-8 border-t pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(document.total, currency)}</dd>
            </div>
            {config.type === 'INVOICE' && Number(document.amountApplied) > 0 ? (
              <>
                <div className="flex justify-between gap-8">
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="tabular">{formatMoney(document.amountApplied, currency)}</dd>
                </div>
                <div className="flex justify-between gap-8 border-t pt-1 font-semibold">
                  <dt>Amount due</dt>
                  <dd className="tabular">{formatMoney(document.balance, currency)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        {document.customerMessage ? (
          <p className="mt-8 border-t pt-4 text-sm text-muted-foreground">{document.customerMessage}</p>
        ) : null}

        {document.status === 'VOID' ? (
          <p className="mt-6 text-center text-lg font-semibold uppercase tracking-widest text-destructive">
            Void
          </p>
        ) : null}
      </article>
    </div>
  )
}
