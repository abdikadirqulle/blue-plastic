import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { StatementWorkbench } from '@/components/banking/statement-workbench'
import { buttonVariants } from '@/components/ui/button'
import { requireOrgContext } from '@/server/auth/context'
import * as bankingService from '@/server/services/banking.service'
import { listImported, STATEMENT_COLUMNS } from '@/server/services/statement-import.service'

export const metadata: Metadata = { title: 'Import statement' }

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('bank:import')
  const params = await searchParams

  const accounts = (await bankingService.bankAccounts(ctx)).filter(
    (account) => account.subtype === 'BANK' || account.subtype === 'CREDIT_CARD',
  )

  const accountId = typeof params.account === 'string' ? params.account : accounts[0]?.id
  const imported = accountId ? await listImported(ctx, accountId) : []

  return (
    <>
      <Link href="/banking" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Banking
      </Link>

      <PageHeader
        title="Bank statement"
        description="An imported line is a claim by the bank, not an entry in the books. Nothing here touches the ledger until you match it to something already posted."
      />

      <StatementWorkbench
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
        accountId={accountId ?? ''}
        columns={STATEMENT_COLUMNS}
        currency={ctx.organization.baseCurrency}
        transactions={imported.map((row) => ({
          id: row.id,
          date: row.date.toISOString(),
          description: row.description,
          reference: row.reference,
          amount: row.amount,
          status: row.status,
          matchedTo: row.matchedJournalLine?.journal.journalNumber ?? null,
          matchedJournalId: row.matchedJournalLine?.journal.id ?? null,
        }))}
      />
    </>
  )
}
