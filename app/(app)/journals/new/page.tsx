import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { buttonVariants } from '@/components/ui/button'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import * as accountService from '@/server/services/account.service'
import { JournalEntryForm } from './journal-entry-form'

export const metadata: Metadata = { title: 'New journal entry' }

export default async function NewJournalPage() {
  const ctx = await requireOrgContext('journal:post')
  const accounts = await accountService.postableAccounts(ctx)

  // Control accounts are maintained by their documents. Leaving them out of the
  // picker is kinder than letting someone choose one and be refused on submit.
  const selectable = accounts.filter(
    (account) =>
      account.subtype !== 'ACCOUNTS_RECEIVABLE' &&
      account.subtype !== 'ACCOUNTS_PAYABLE' &&
      account.subtype !== 'INVENTORY',
  )

  return (
    <>
      <Link href="/journals" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Journal entries
      </Link>

      <PageHeader
        title="New journal entry"
        description="Debits on the left, credits on the right. Accounts receivable, accounts payable and inventory are maintained by their own documents and are not listed here."
      />

      <JournalEntryForm
        accounts={selectable}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
