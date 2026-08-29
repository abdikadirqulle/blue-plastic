# 02 — Accounting Engine Design

This is the most important document in the repository. Everything else can be
refactored; a corrupted ledger cannot.

## 1. The chain

```
Business Transaction  ->  Journal  ->  Journal Entries  ->  General Ledger  ->  Financial Statements
   (Invoice, Bill,        (header:      (lines: account,     (all posted        (TB, P&L, BS,
    Payment, ...)          date, no.)    debit, credit)       lines)             Cash Flow)
```

Each step is a real object in the system:

| Step | Table | Rule |
| --- | --- | --- |
| Business transaction | `invoices`, `bills`, `payments`, ... | The *document*. Human-facing. Mutable. |
| Journal | `journals` | Immutable once posted. One per document version. |
| Journal entries | `journal_lines` | >= 2 lines, sum(debit) = sum(credit), each line one-sided. |
| General ledger | *view over* `journal_lines` where journal is `POSTED` | Never a separate writable table. |
| Financial statements | computed | Never stored. Always derivable. |

**The general ledger is not a table you write to. It is the set of posted journal
lines.** There is no `account.balance` column to drift out of sync, no nightly job
to "rebuild balances", and no possibility of the ledger disagreeing with the
journals, because they are the same rows.

## 2. Non-negotiable integrity rules

Each is enforced in **two** places: the posting engine (clear errors, good UX) and
the database (the actual guarantee). Application-only enforcement is not
enforcement -- a psql session, a migration script or a future service will bypass it.

| # | Rule | DB enforcement |
| --- | --- | --- |
| R1 | A line is a debit **or** a credit, never both, never negative | `CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))` |
| R2 | Every journal balances: sum(debit) = sum(credit) | `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` -- validated at COMMIT, so multi-statement inserts are legal but an unbalanced commit is not |
| R3 | A journal has >= 2 lines | same deferred trigger |
| R4 | A posted journal is immutable | `BEFORE UPDATE OR DELETE` trigger on `journals` / `journal_lines` rejects any change once `status = 'POSTED'` (except the single `POSTED -> REVERSED` status transition) |
| R5 | No posting into a closed period | trigger joins `accounting_periods`, rejects `status <> 'OPEN'` |
| R6 | The journal date must fall inside its period | trigger check |
| R7 | AR lines carry a customer, AP lines carry a vendor | trigger on `journal_lines` against the line's account `systemKey` |
| R8 | Control accounts are engine-only | AR / AP / Inventory / Retained Earnings are `isSystem` and rejected by the manual-journal validator |
| R9 | All lines of a journal belong to the journal's organisation | composite FK on `(orgId, accountId)` |
| R10 | An account with posted lines cannot be deleted | `ON DELETE RESTRICT` + soft delete (`isActive`) only |

R4 has a consequence worth stating: reconciliation cannot mark a journal line as
cleared, because that would be a change to a posted line. Clearing is therefore
recorded in a separate table (`reconciliation_entries`) keyed by journal line —
the fact lives beside the line rather than on it, and the ledger stays append-only
through reconciliation. See docs/phases/phase-06-banking.md.

A second consequence: because R4 and R10 hold all the way down, an
**organisation with a posted ledger cannot be deleted either** — a cascade is
refused by the immutability triggers. Erasing one is a deliberate out-of-band
operation, never an application feature.

R2 deserves a note. Enforcing balance with a normal `CHECK` is impossible (it spans
rows) and enforcing it with an immediate trigger would make it impossible to insert
lines one at a time. A **deferred constraint trigger** is exactly the right tool: it
fires once per transaction at COMMIT. An unbalanced journal cannot exist outside an
open transaction, by any means, from any client.

## 3. Correction model: reverse, never edit

Posted journals are immutable. That is not a limitation -- it is the audit trail.

But *documents* are mutable, because a user must be able to fix a typo on an
invoice. The two are reconciled like this:

```
Invoice v1  --posts-->  Journal J1 (POSTED)
   user edits the invoice
Invoice v2  --posts-->  Journal J2 = reversal of J1  (POSTED, isReversal, reversalOfId=J1)
            --posts-->  Journal J3 = new state       (POSTED)
                        J1.status -> REVERSED
```

Net ledger effect equals the new document. Every intermediate state remains
inspectable. The same mechanism serves voids (reverse, no re-post) and deletions
(reverse, mark the document `VOID`; documents are never hard-deleted once posted).

Reversals are dated on the **later of** the original date and the first open period,
so a correction never re-opens a closed month.

## 4. Chart of accounts

Five statement types, each with detail subtypes that drive both classification on
reports and behaviour in the app:

| Type | Normal balance | Subtypes |
| --- | --- | --- |
| ASSET | Debit | `BANK`, `ACCOUNTS_RECEIVABLE`, `UNDEPOSITED_FUNDS`, `INVENTORY`, `OTHER_CURRENT_ASSET`, `FIXED_ASSET`, `ACCUMULATED_DEPRECIATION`, `OTHER_ASSET` |
| LIABILITY | Credit | `ACCOUNTS_PAYABLE`, `CREDIT_CARD`, `SALES_TAX_PAYABLE`, `OTHER_CURRENT_LIABILITY`, `LONG_TERM_LIABILITY` |
| EQUITY | Credit | `OWNERS_EQUITY`, `RETAINED_EARNINGS`, `OPENING_BALANCE_EQUITY`, `DRAWINGS` |
| REVENUE | Credit | `INCOME`, `OTHER_INCOME`, `SALES_DISCOUNTS` (contra) |
| EXPENSE | Debit | `COST_OF_GOODS_SOLD`, `OPERATING_EXPENSE`, `OTHER_EXPENSE`, `DEPRECIATION` |

Accounts are hierarchical (`parentId`, max depth 4) for report grouping only --
parents never carry postings of their own.

### System accounts

A small set of accounts is referenced by code, identified by a stable `systemKey`
that is unique per organisation and immutable after seeding:

`ACCOUNTS_RECEIVABLE`, `ACCOUNTS_PAYABLE`, `UNDEPOSITED_FUNDS`, `INVENTORY_ASSET`,
`COGS`, `SALES_TAX_PAYABLE`, `RETAINED_EARNINGS`, `OPENING_BALANCE_EQUITY`,
`EXCHANGE_GAIN_LOSS`, `ROUNDING_DIFFERENCE`, `INVENTORY_SHRINKAGE`,
`UNCATEGORISED_INCOME`, `UNCATEGORISED_EXPENSE`.

They are created by the seeder, cannot be deleted, and cannot be reassigned to a
different `systemKey`. Their display name and account code *are* editable -- an
accountant should be able to call it "Trade Debtors" if they want.

## 5. Accounting periods

`accounting_periods` are generated per fiscal year (12 monthly periods, plus period
0 for opening balances) with status `OPEN -> CLOSED -> LOCKED`.

- `OPEN` -- postings allowed.
- `CLOSED` -- soft close. Postings rejected; a user with `period:reopen` can reopen.
- `LOCKED` -- hard close, after the year-end closing entry. Irreversible without a
  database-level intervention.

Fiscal year start month is an organisation setting (default January).

## 6. Year-end close

Revenue and expense accounts are nominal and must not carry across years.

- While a fiscal year is open, the balance sheet shows **Net Income (current
  period)** as a computed line -- no journal exists for it.
- At year-end close, one closing journal moves every P&L account balance to
  `RETAINED_EARNINGS`, dated the last day of the year, flagged `isClosingEntry`.
  The trial balance for the following year then opens clean.

This is why retained earnings is never computed on the fly for prior years: after
close, the ledger itself carries it.

## 7. Money, rounding, tax

- Storage: `NUMERIC(19,4)`. Unit prices and quantities keep 4 decimals; posted
  amounts are rounded to the currency's minor unit (2 for USD) **before** posting.
- Rounding: half away from zero (commercial rounding), applied per line.
- Tax is computed **per line**, rounded per line, then summed. Computing on the
  document total and back-allocating produces totals that disagree with the printed
  invoice by a cent, which customers do notice.
- If a document's rounded lines do not sum to its rounded total (possible with
  inclusive tax), the residue posts to `ROUNDING_DIFFERENCE` -- it is never silently
  absorbed into revenue.

## 8. Subledgers

AR and AP are control accounts. Their GL balance must always equal the sum of their
subledger.

This is guaranteed structurally rather than by a reconciliation job:

- Only the posting engine may write lines to a control account (R8).
- Every control-account line carries its `customerId` / `vendorId` (R7).
- Therefore "AR aging" and "AR control balance" are two queries over the *same*
  rows, and cannot disagree.

A `subledger:integrity` check runs in the test suite and as an on-demand admin
report anyway, because a rule you never verify is a rule you only believe.

### Payment application

Payments are not applied by mutating invoices. `payment_applications`
(paymentId, invoiceId, amount) is a separate table; an invoice's outstanding balance
is `total - sum(applications)`. This allows partial payments, one payment across many
invoices, credit memos applied as payment, and unapplied cash sitting correctly on
the balance sheet as a customer credit.

## 9. Inventory and COGS

Blue Plastic Center sells goods, so inventory is not optional.

- **Perpetual** inventory with **weighted-average cost** (chosen over FIFO for the
  first implementation: it is far simpler to keep correct under back-dated
  transactions, and it is acceptable under both IFRS and US GAAP).
- Every inventory movement writes an `inventory_transactions` row (qty in/out, unit
  cost, running qty, running value) and the sale posts COGS in the *same journal* as
  the revenue.
- Selling into negative stock is blocked by default (an organisation setting can
  allow it, in which case cost is estimated at last cost and trued up on receipt).

## 10. Document to journal map

`Dr` = debit, `Cr` = credit. Every one of these is produced by a single builder
function in `server/accounting/builders/*`, unit-tested against a fixed expected
journal.

### Sales

| Document | Journal |
| --- | --- |
| **Invoice** | Dr AR (customer) - Cr Income (per line) - Cr Sales Tax Payable - *if stocked:* Dr COGS, Cr Inventory Asset |
| **Sales receipt** | Dr Bank/Undeposited Funds - Cr Income - Cr Sales Tax Payable - *if stocked:* Dr COGS, Cr Inventory |
| **Customer payment** | Dr Bank/Undeposited Funds - Cr AR (customer) |
| **Deposit** | Dr Bank - Cr Undeposited Funds (and/or direct income lines) |
| **Credit memo** | Dr Income - Dr Sales Tax Payable - Cr AR (customer) - *if returned to stock:* Dr Inventory, Cr COGS |
| **Customer refund** | Dr AR (customer) - Cr Bank |
| **Bad debt write-off** | Dr Bad Debt Expense - Cr AR (customer) |

### Purchases

| Document | Journal |
| --- | --- |
| **Bill** | Dr Expense / Inventory / Fixed Asset (per line) - Dr Tax Receivable (if recoverable) - Cr AP (vendor) |
| **Bill payment** | Dr AP (vendor) - Cr Bank |
| **Expense** (paid immediately) | Dr Expense - Cr Bank / Credit Card |
| **Vendor credit** | Dr AP (vendor) - Cr Expense / Inventory |
| **Vendor refund** | Dr Bank - Cr AP (vendor) |

### Banking and adjustments

| Document | Journal |
| --- | --- |
| **Transfer** | Dr destination bank - Cr source bank |
| **Bank charge / interest** | Dr Expense - Cr Bank  /  Dr Bank - Cr Other Income |
| **Inventory adjustment** | Dr/Cr Inventory Asset - Cr/Dr Inventory Shrinkage |
| **Opening balance** | Dr/Cr the account - Cr/Dr Opening Balance Equity |
| **Manual journal** | user-defined, validated against R1-R9 |
| **Year-end close** | Dr each revenue account - Cr each expense account - balance to Retained Earnings |

## 11. Posting engine contract

```ts
type DraftJournal = {
  date: CalendarDate
  memo?: string
  sourceType: JournalSourceType
  sourceId: string
  isAdjusting?: boolean
  lines: DraftLine[]          // { accountId, debit?, credit?, description?,
}                             //   customerId?, vendorId?, itemId?, taxCodeId? }

postJournal(tx: PrismaTx, ctx: OrgContext, draft: DraftJournal): Promise<Journal>
reverseJournal(tx, ctx, journalId, on: CalendarDate, reason: string): Promise<Journal>
```

`postJournal` is the **only** function in the codebase that inserts into `journals`
or `journal_lines`. It:

1. resolves the accounting period for `date` and rejects a non-open period;
2. rounds every amount to the currency minor unit;
3. drops zero-amount lines, then requires >= 2 remaining lines;
4. asserts sum(debit) = sum(credit) to the cent;
5. validates account ownership, activity, and subledger dimension requirements;
6. allocates the journal number from `document_sequences` with a row lock;
7. inserts header + lines and writes the audit row -- all inside the caller's
   transaction, so a failed document never leaves an orphan journal.

It takes an existing `tx` rather than opening its own, precisely so that
"create the invoice and post its journal" is one atomic unit.

## 12. Reports

All statements are derived by SQL aggregation over posted journal lines:

| Report | Definition |
| --- | --- |
| Trial balance | sum(debit), sum(credit) per account for a date range; must net to zero |
| General ledger | lines per account, ordered by date, with running balance |
| Profit & loss | REVENUE - EXPENSE for a date range, by subtype grouping |
| Balance sheet | ASSET = LIABILITY + EQUITY + net income to date, as at a date |
| Cash flow | indirect method: net income + non-cash adjustments +/- working capital |
| AR / AP aging | outstanding document balances bucketed 0-30-60-90+ from due date |
| Sales by customer / item | revenue lines grouped by subledger dimension |
| Tax summary | tax-code lines for a return period |

The balance sheet's self-check (assets - liabilities - equity = 0) runs on every
render. If it is ever non-zero the report renders an explicit integrity error rather
than a plausible-looking wrong number.

The profit and loss and the cash flow exclude the year-end closing entry; the
balance sheet, trial balance and general ledger include it. A closing entry is
dated inside the year it closes, so counting it would report that year as having
earned nothing — see
[ADR-0011](./decisions/0011-closing-entries-excluded-from-the-profit-and-loss.md).
