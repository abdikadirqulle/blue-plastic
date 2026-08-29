import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { TransferForm } from '@/components/banking/transfer-form'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import * as bankingService from '@/server/services/banking.service'

export const metadata: Metadata = { title: 'Transfer' }

export default async function NewTransferPage() {
  const ctx = await requireOrgContext('bank:transact')
  const accounts = await bankingService.bankAccounts(ctx)

  return (
    <>
      <Link href="/banking" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Banking
      </Link>

      <PageHeader
        title="Transfer between accounts"
        description="Money moves; nothing is earned or spent. This posts only between the two accounts."
      />

      <TransferForm
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
