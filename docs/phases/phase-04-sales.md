# Phase 4 — Sales & Accounts Receivable

**Status:** ✅ Complete — 2026-08-29
**Depends on:** Phases 2 and 3
**Blocks:** Phase 6 (deposits), Phase 8 (sales reports)

## Goal

The documents a business sends a customer, and the money that comes back.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 4.1 | Invoice document, lines, totals, tax, terms, due date | `prisma/schema.prisma`, `server/accounting/sales-pricing.ts` | ✅ |
| 4.2 | Posting builders and edit-as-reverse-and-repost | `server/accounting/builders/sales.ts`, `sales.service.ts` | ✅ |
| 4.3 | Estimates and estimate → invoice conversion | `sales.service.ts` | ✅ |
| 4.4 | Sales receipts | shared document pipeline | ✅ |
| 4.5 | Payments with application, partial and unapplied | `server/services/payment.service.ts` | ✅ |
| 4.6 | Credit memos and their application | `payment.service.ts` | ✅ |
| 4.7 | Refund receipts | shared document pipeline | ✅ |
| 4.8 | AR aging, statement, customer transactions | `server/services/receivables.service.ts` | ✅ |
| 4.9 | Numbering, print / PDF layout | `app/(app)/sales/[type]/[id]/print/` | ✅ |
| 4.10 | Void semantics | `sales.service.ts` | ✅ |

## One table for five documents

`SalesDocument` holds invoices, estimates, sales receipts, credit memos and
refunds, discriminated by `type`. They share a shape — a customer, a date, lines,
tax, a total — and splitting them into five near-identical tables would mean five
copies of the totalling logic and a five-way union every time anyone asks what a
customer has been sent.

The estimate is the odd one out: a quotation, not a transaction, so it posts no
journal. `POSTS_A_JOURNAL` says so in one place.

## What is stored, and what is derived

- **Totals are stored.** They are what the customer was shown and what the ledger
  was told. Recomputing them later from prices that may since have changed would
  quietly restate a document that has already been sent. A deferred trigger
  checks they agree with their own lines.
- **The outstanding balance is derived**, always: `total − Σ applications`. That
  is what lets partial payments, one payment across many invoices, credits used
  as payment and unapplied cash all work without being special cases — and it is
  why the aging report cannot disagree with the receivables control account.

## The journals

Each builder is a pure function, tested against a fixed expected journal. See
`tests/sales-builders.test.ts`.

| Document | Journal |
| --- | --- |
| Invoice | Dr AR (carrying the customer) · Cr Income per account · Cr tax per rate |
| Sales receipt | Dr bank / undeposited funds · Cr Income · Cr tax |
| Credit memo | Dr Income · Dr tax · Cr AR (carrying the customer) |
| Refund receipt | Dr Income · Dr tax · Cr bank |
| Payment | Dr bank / undeposited funds · Cr AR (carrying the customer) |

The payment journal touches **no income account**. The revenue was recognised when
the invoice was raised; the payment only moves what the customer owes into the
bank. Recognising it again when the cash arrives is the classic double-count, and
a test asserts the journal has exactly two lines.

Applying a credit memo posts **nothing** — the memo already put the credit in the
ledger. Applying it only records which receivable it settles.

## Pricing order, and why it is not arbitrary

```
quantity × unit price  →  less the line discount  →  tax on what remains
```

Tax is charged on the discounted amount because that is what the customer is
actually being charged; taxing before the discount would collect tax on money
nobody paid. For an inclusive tax code the revenue recognised is the *extracted
net*, not the price on the line.

## Editing and voiding

Editing a posted document reverses its journal and posts a new one, bumping
`version` — ADR-0002. Both stay on the record; the net ledger effect equals the
new document.

An edit is refused while anything is applied to the document. Changing what an
invoice says underneath a payment that settled it would leave the payment
settling something that no longer exists.

Voiding reverses the journal and keeps the paper. Nothing is deleted: a missing
invoice number is a question nobody can answer later, and a voided one answers it.

## Deliberate restriction: tracked inventory cannot be sold yet

An invoice line naming an `INVENTORY` item is **refused**, with a message saying
why.

Selling tracked stock has to move the stock and post its cost in the same journal
as the revenue. The costing engine arrives in Phase 7. Allowing the sale without
the cost would overstate gross margin on every one of them — and gross margin is
the number this business runs on. A missing feature is better than a wrong number.

Service and non-inventory items sell normally, which covers everything the
business can currently cost.

## The guards

Five more objects, bringing the total to **25**.

| Guard | Prevents |
| --- | --- |
| `sales_applications_one_source` | an application with neither a payment nor a credit (settling an invoice out of nothing), or with both (counted twice) |
| `sales_applications_positive` | a zero or negative application |
| `trg_application_target` | settling an estimate, a draft or a void; over-applying an invoice past its total, which would be a negative receivable |
| `trg_application_source` | applying more of a payment or credit than it is worth |
| `trg_document_totals` | a posted document whose stored totals disagree with its own lines |
| `sales_documents_non_negative` | a negative total — that is a credit memo |
| `sales_documents_deposit_required` | a posted receipt that does not say where the cash went |
| `sales_lines_document_org_fkey`, `sales_applications_invoice_org_fkey` | crossing organisations (R9) |

## A hazard that nearly cost the ledger its guarantees

`prisma migrate dev` refused to run at all this phase, asking to **reset the
database** — which here is the real one. The cause is the same drift problem as
Phase 3, one step worse: `migrate dev` works through a shadow database that the
hosted pooler will not provide, so it falls back to offering a reset.

`prisma migrate diff` needs no shadow database, but emits `DROP` statements for
every hand-written object. Run blindly, this phase's migration would have removed
all four tenancy foreign keys.

`pnpm db:new-migration <name>` now does the diff, **strips the drops of our own
constraints** (it reads their names out of `prisma/sql/`), and appends the SQL
files so a fresh database gets them from the migration itself. `pnpm db:migrate`
now fails with an explanation rather than doing the wrong thing.

**The workflow is: `pnpm db:new-migration <name>`, review, `pnpm db:deploy`,
`pnpm db:verify`.**

## Verification

`pnpm verify` — lint clean, typecheck clean, **173 tests**. `pnpm build` clean.
`pnpm db:verify` — all 25 integrity objects present.

| Area | Covered |
| --- | --- |
| Pricing (7) | quantity × price, discount before tax, per-line rounding, inclusive extraction, tax grouped by rate, and a property test that total always equals subtotal + tax |
| Builders (16) | every document's debits and credits against a fixed expected journal; the credit memo proved to be the exact mirror of the invoice; the payment proved to touch no income |
| Guards (13) | each attacked with raw SQL: over-application, over-drawing a payment, settling an estimate or a draft, both-sources, neither-source, negative totals, a receipt with no deposit account, totals that disagree with lines, and crossing organisations |

## What Phase 4 deliberately does not do

- No COGS on sales — Phase 7, and inventory items are blocked until then.
- No emailing. The print view produces the customer-facing document and saves to
  PDF through the browser's own dialog, which needs no headless browser in the
  deployment.
- No recurring invoices or deposits against invoices — Phase 10.
- No bank deposits clearing Undeposited Funds — Phase 6. Payments can already be
  received into it; clearing it is banking's job.
