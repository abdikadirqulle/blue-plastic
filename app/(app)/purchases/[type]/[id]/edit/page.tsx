import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { BillForm } from '@/components/purchases/bill-form'
import { buttonVariants } from '@/components/ui/button'
import { toCalendarDate, today } from '@/lib/date'
import { describeTerm } from '@/lib/payment-terms'
import { purchaseBySlug } from '@/lib/purchase-types'
import { requireOrgContext } from '@/server/auth/context'
import { loadPurchaseOptions } from '@/server/services/purchase-options'
import * as purchaseService from '@/server/services/purchase.service'

export const metadata: Metadata = { title: 'Edit document' }

/**
 * Editing a posted purchase. As on the sales side, saving reverses the original
 * journal and posts a replacement rather than rewriting anything (ADR-0002).
 */
export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  const config = purchaseBySlug(type)
  if (!config) notFound()

  const ctx = await requireOrgContext('bill:update')
  const [document, options] = await Promise.all([
    purchaseService.get(ctx, id),
    loadPurchaseOptions(ctx),
  ])

  if (document.type !== config.type) notFound()

  return (
    <>
      <Link
        href={`/purchases/${config.slug}/${id}`}
        className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}
      >
        <ArrowLeftIcon /> {config.singular} {document.number}
      </Link>

      <PageHeader
        title={`Edit ${config.singular.toLowerCase()} ${document.number}`}
        description="Saving reverses the original entry and posts a replacement. Both stay in the ledger."
      />

      <BillForm
        config={config}
        vendors={options.vendors}
        items={options.items}
        taxCodes={options.taxCodes}
        paymentAccounts={options.paymentAccounts}
        expenseAccounts={options.expenseAccounts}
        terms={options.terms.map((term) => ({ id: term.id, label: `${term.name} — ${describeTerm(term)}` }))}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
        document={{
          id: document.id,
          vendorId: document.vendor.id,
          date: toCalendarDate(document.date),
          reference: document.reference,
          memo: document.memo,
          paymentTermId: document.paymentTerm?.id ?? null,
          paymentAccountId: document.paymentAccount?.id ?? null,
          lines: document.lines.map((line) => ({
            itemId: line.item?.id ?? null,
            expenseAccountId: line.expenseAccount?.id ?? null,
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            taxCodeId: line.taxCode?.id ?? null,
          })),
        }}
      />
    </>
  )
}
