import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/page-header'
import { buttonVariants } from '@/components/ui/button'
import { accountOptions } from '@/lib/account-options'
import { today } from '@/lib/date'
import { requireOrgContext } from '@/server/auth/context'
import { db } from '@/server/db'
import { peekDocumentNumber } from '@/server/sequences'
import * as accountService from '@/server/services/account.service'
import { JournalEntryForm } from './journal-entry-form'

export const metadata: Metadata = { title: 'New journal entry' }

export default async function NewJournalPage() {
  const ctx = await requireOrgContext('journal:post')

  const [chart, customers, vendors, entryNumber] = await Promise.all([
    // The whole chart. Every postable account, receivables, payables, stock and
    // system accounts included. The screen used to hide those three, on the
    // theory that a hand-written entry against a control account would break the
    // agreement with its subledger. It does not: the subledger *is* the control
    // account's lines, and the reports read them. What the ledger actually
    // requires is a name on the line (R7), which is what the form now asks for.
    accountService.selectableAccounts(ctx),
    db.customer.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, displayName: true, companyName: true },
      orderBy: { displayName: 'asc' },
    }),
    db.vendor.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, displayName: true, companyName: true },
      orderBy: { displayName: 'asc' },
    }),
    peekDocumentNumber(db, ctx.orgId, 'JOURNAL'),
  ])

  return (
    <>
      <Link href="/journals" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} mb-3 -ml-2`}>
        <ArrowLeftIcon /> Journal entries
      </Link>

      <PageHeader
        title="New journal entry"
        description="Debits on the left, credits on the right. Every account in the chart is available; a line against receivables or payables has to say whose balance it moves."
      />

      <JournalEntryForm
        accounts={accountOptions(chart)}
        customers={customers.map((customer) => ({
          id: customer.id,
          label: customer.displayName,
          hint: customer.companyName ?? undefined,
        }))}
        vendors={vendors.map((vendor) => ({
          id: vendor.id,
          label: vendor.displayName,
          hint: vendor.companyName ?? undefined,
        }))}
        entryNumber={entryNumber}
        today={today(ctx.organization.timeZone)}
        currency={ctx.organization.baseCurrency}
      />
    </>
  )
}
