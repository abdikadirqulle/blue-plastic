import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/data/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { requireOrgContext } from '@/server/auth/context'

export const metadata: Metadata = { title: 'How the ledger works' }

const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: 'Journal',
    meaning:
      'One transaction, as the ledger records it. It has two or more lines, and its debits equal its credits. Every invoice, bill, payment and adjustment produces exactly one.',
  },
  {
    term: 'Debit and credit',
    meaning:
      'Not good and bad. A debit increases an asset or an expense and decreases a liability, equity or income; a credit does the opposite. Both sides of every transaction are always equal.',
  },
  {
    term: 'Control account',
    meaning:
      'Accounts Receivable and Accounts Payable. Their balance is the total of what every customer owes, or what is owed to every vendor. The ageing reports check they still agree.',
  },
  {
    term: 'Nominal account',
    meaning:
      'Income and expense accounts. They measure a year rather than a state, and the year-end closing entry returns them to zero.',
  },
  {
    term: 'Accrual and cash basis',
    meaning:
      'Accrual counts an invoice when it is raised. Cash counts it when it is paid. Every report here can be read either way; accrual is the default and the one the balance sheet is built on.',
  },
  {
    term: 'Adjusting entry',
    meaning:
      'A journal nobody in the business made: depreciation, an accrual, a prepayment, a correction. Marked as such so it can be found and reviewed on its own.',
  },
  {
    term: 'Category line and item line',
    meaning:
      'Two ways a purchase line can be entered. A category line names the account a cost lands in — rent, fuel, a fee — and an amount; nothing is counted. An item line names a product, a quantity and a unit cost, and takes its account from the item. A bill can carry both. Sales documents have item lines only: an invoice line posts to the income account its item names.',
  },
  {
    term: 'Inventory, non-inventory, service',
    meaning:
      'Only an inventory item has a quantity. Selling one reduces stock and posts its cost against the sale. A non-inventory item is bought and expensed at the time of purchase, so selling it moves no stock and posts no cost — which is why it never appears on the Inventory screen. The type cannot be changed after an item exists, because it would reclassify everything already sold through it.',
  },
  {
    term: 'Undeposited Funds',
    meaning:
      'Money received but not yet in the bank. It sits here until the deposit is recorded, which is what makes the bank reconciliation possible.',
  },
  {
    term: 'Opening Balance Equity',
    meaning:
      'The other side of every balance entered when the books started. It is a staging account: once the setup is right, its balance belongs in capital or retained earnings and it should read zero.',
  },
]

export default async function LedgerHelpPage() {
  await requireOrgContext()

  return (
    <>
      <PageHeader
        title="How the ledger works"
        description="The parts of double-entry bookkeeping this system assumes you already have in mind, stated plainly."
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5 text-sm">
            <p className="font-medium">Everything is a journal.</p>
            <p className="text-muted-foreground">
              An invoice is not stored as a number owed. It is stored as a journal that debits Accounts
              Receivable and credits income and tax, and the invoice document is a record of how that journal
              was entered. This is why the reports and the documents can never disagree: there is only one
              set of numbers, and the documents are a way of writing to it.
            </p>
            <p className="text-muted-foreground">
              It is also why a mistake is corrected by reversing and re-entering rather than by editing. The
              ledger is a record of what happened, including what happened by mistake.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5 text-sm">
            <p className="font-medium">The database is what enforces this, not the screens.</p>
            <p className="text-muted-foreground">
              Fifty-six constraints and triggers refuse an unbalanced journal, an edit to a posted one, a
              posting into a closed period, a receivable with no customer, and a line that belongs to another
              organisation. The forms give good error messages; the database gives the guarantee. If the two
              ever disagree, the database wins and the form is the thing with the bug.
            </p>
          </CardContent>
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Words used precisely</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {GLOSSARY.map((entry) => (
                <div key={entry.term} className="p-4">
                  <p className="text-sm font-medium">{entry.term}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.meaning}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <p className="text-sm text-muted-foreground">
          The design decisions behind all of this are written down in the repository under{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/</code> — the accounting rules, the
          database design, and a numbered record of every architectural decision and why it was taken. Start
          with the{' '}
          <Link href="/help" className="underline underline-offset-4">
            order of work
          </Link>{' '}
          if you want the practical version instead.
        </p>
      </div>
    </>
  )
}
