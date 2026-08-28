import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ContactDetail } from '@/components/master-data/contact-detail'
import { describeTerm } from '@/lib/payment-terms'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as contactService from '@/server/services/contact.service'

export const metadata: Metadata = { title: 'Vendor' }

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext('vendor:read')
  const { id } = await params

  const vendor = await contactService.getVendor(ctx, id).catch(() => null)
  if (!vendor) notFound()

  const currency = ctx.organization.baseCurrency

  return (
    <>
      <Link href="/vendors" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Vendors
      </Link>

      <PageHeader
        title={vendor.displayName}
        description={vendor.companyName ?? undefined}
        actions={!vendor.isActive ? <Badge variant="outline">archived</Badge> : undefined}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">You owe</p>
            <p className="tabular mt-0.5 text-lg font-semibold">{formatMoney(vendor.balance, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payment terms</p>
            <p className="mt-0.5 text-sm font-medium">
              {vendor.paymentTerm ? describeTerm(vendor.paymentTerm) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Default expense account</p>
            <p className="mt-0.5 text-sm font-medium">
              {vendor.defaultExpenseAccount
                ? `${vendor.defaultExpenseAccount.code} ${vendor.defaultExpenseAccount.name}`
                : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <ContactDetail contact={vendor} side="vendor" />

      <p className="mt-6 text-sm text-muted-foreground">
        Bills and payments for this vendor arrive in phase 5. The balance above is already real: it is the
        sum of this vendor&rsquo;s posted ledger lines.
      </p>
    </>
  )
}
