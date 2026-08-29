import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { DepositForm } from '@/components/banking/deposit-form'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import * as bankingService from '@/server/services/banking.service'

export const metadata: Metadata = { title: 'Make a deposit' }

export default async function NewDepositPage() {
  const ctx = await requireOrgContext('bank:transact')

  const [accounts, payments, allAccounts] = await Promise.all([
    bankingService.bankAccounts(ctx),
    bankingService.undepositedPayments(ctx),
    accountService.postableAccounts(ctx),
  ])

  return (
    <>
      <Link href="/banking" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Banking
      </Link>

      <PageHeader
        title="Make a deposit"
        description="Take what is in hand to the bank. This clears Undeposited Funds, so the register shows one paying-in slip where the bank shows one — which is what makes reconciliation possible."
      />

      <DepositForm
        bankAccounts={accounts
          .filter((a) => a.subtype === 'BANK')
          .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
        otherAccounts={allAccounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
        payments={payments.map((payment) => ({
          id: payment.id,
          number: payment.number,
          date: payment.date.toISOString(),
          amount: payment.amount,
          customer: payment.customer.displayName,
          reference: payment.reference,
        }))}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
