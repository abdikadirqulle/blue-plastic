import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { BillForm } from '@/components/purchases/bill-form'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { describeTerm } from '@/lib/payment-terms'
import { purchaseBySlug } from '@/lib/purchase-types'
import { requireOrgContext } from '@/server/auth/context'
import { loadPurchaseOptions } from '@/server/services/purchase-options'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  return { title: `New ${purchaseBySlug((await params).type)?.singular.toLowerCase() ?? 'document'}` }
}

export default async function NewPurchasePage({ params }: { params: Promise<{ type: string }> }) {
  const config = purchaseBySlug((await params).type)
  if (!config) notFound()

  const ctx = await requireOrgContext('bill:create')
  const options = await loadPurchaseOptions(ctx)

  return (
    <>
      <Link
        href={`/purchases/${config.slug}`}
        className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}
      >
        <ArrowLeftIcon /> {config.plural}
      </Link>

      <PageHeader title={`New ${config.singular.toLowerCase()}`} description={config.effect} />

      <BillForm
        config={config}
        vendors={options.vendors}
        items={options.items}
        taxCodes={options.taxCodes}
        paymentAccounts={options.paymentAccounts}
        expenseAccounts={options.expenseAccounts}
        terms={options.terms.map((t) => ({ id: t.id, label: `${t.name} — ${describeTerm(t)}` }))}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
