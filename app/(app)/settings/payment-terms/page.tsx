import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { describeTerm } from '@/lib/payment-terms'
import { requireOrgContext } from '@/server/auth/context'
import * as taxService from '@/server/services/tax.service'
import { PaymentTermButton } from './payment-term-form'

export const metadata: Metadata = { title: 'Payment terms' }

export default async function PaymentTermsPage() {
  const ctx = await requireOrgContext('org:read')
  const terms = await taxService.listPaymentTerms(ctx, { includeInactive: true })
  const canManage = ctx.permissions.has('tax:manage')

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Payment terms</CardTitle>
          <CardDescription>
            When a document falls due. The due date is computed from the document&rsquo;s own date, so a
            back-dated invoice is overdue the moment it is entered.
          </CardDescription>
        </div>
        {canManage ? <PaymentTermButton /> : null}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Early settlement</TableHead>
              <TableHead className="numeric w-24">In use</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((term) => (
              <TableRow key={term.id}>
                <TableCell className="font-medium">{term.name}</TableCell>
                <TableCell className="text-muted-foreground">{describeTerm(term)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {term.discountDays && term.discountPercent
                    ? `${term.discountPercent}% if paid within ${term.discountDays} days`
                    : '—'}
                </TableCell>
                <TableCell className="numeric tabular">
                  {term._count.customers + term._count.vendors}
                </TableCell>
                <TableCell>
                  {term.isDefault ? <Badge variant="secondary">default</Badge> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
