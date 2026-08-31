import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { BillPaymentForm } from '@/components/purchases/bill-payment-form'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import { loadPurchaseOptions } from '@/server/services/purchase-options'
import { vendorPayables } from '@/app/(app)/purchases/actions'

export const metadata: Metadata = { title: 'Pay bills' }

export default async function NewBillPaymentPage() {
  const ctx = await requireOrgContext('expense:create')
  const options = await loadPurchaseOptions(ctx)

  return (
    <>
      <Link href="/bill-payments" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Bill payments
      </Link>

      <PageHeader
        title="Pay bills"
        description="Money out, payables down. Tick what you are settling — one payment can cover several bills — and the account you are paying from shows what it holds."
      />

      <BillPaymentForm
        vendors={options.vendors.map((v) => ({ id: v.id, label: v.label }))}
        paymentAccounts={options.paymentAccounts}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
        loadPayables={vendorPayables}
      />
    </>
  )
}
