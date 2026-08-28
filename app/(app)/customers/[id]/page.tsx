import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { describeTerm } from '@/lib/payment-terms'
import { formatMoney } from '@/lib/money'
import { requireOrgContext } from '@/server/auth/context'
import * as contactService from '@/server/services/contact.service'
import { ContactDetail } from '@/components/master-data/contact-detail'

export const metadata: Metadata = { title: 'Customer' }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext('customer:read')
  const { id } = await params

  const customer = await contactService.getCustomer(ctx, id).catch(() => null)
  if (!customer) notFound()

  const currency = ctx.organization.baseCurrency

  return (
    <>
      <Link href="/customers" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Customers
      </Link>

      <PageHeader
        title={customer.displayName}
        description={customer.companyName ?? undefined}
        actions={!customer.isActive ? <Badge variant="outline">archived</Badge> : undefined}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Owes you</p>
            <p className="tabular mt-0.5 text-lg font-semibold">
              {formatMoney(customer.balance, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payment terms</p>
            <p className="mt-0.5 text-sm font-medium">
              {customer.paymentTerm ? describeTerm(customer.paymentTerm) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Credit limit</p>
            <p className="tabular mt-0.5 text-sm font-medium">
              {customer.creditLimit ? formatMoney(customer.creditLimit, currency) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <ContactDetail contact={customer} side="customer" />

      <p className="mt-6 text-sm text-muted-foreground">
        Invoices, payments and the statement for this customer arrive in phase 4. The balance above is
        already real: it is the sum of this customer&rsquo;s posted ledger lines.
      </p>
    </>
  )
}
