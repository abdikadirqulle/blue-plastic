import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { TransferForm } from '@/components/banking/transfer-form'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { accountOptions } from '@/lib/account-options'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'

export const metadata: Metadata = { title: 'Transfer' }

export default async function NewTransferPage() {
  const ctx = await requireOrgContext('bank:transact')
  // Every balance-sheet account, money accounts first. A transfer is a movement
  // between the business's own accounts, and which of them count as "money" is
  // the business's decision, not a fixed list of three subtypes.
  const chart = await accountService.selectableAccounts(ctx, { withBalances: true })
  const accounts = accountOptions(
    chart.filter((account) => account.type === 'ASSET' || account.type === 'LIABILITY'),
    { prefer: ['BANK', 'CREDIT_CARD', 'UNDEPOSITED_FUNDS', 'OTHER_CURRENT_ASSET'], showBalance: true },
  )

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
        accounts={accounts}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
