# Phase 5 — Purchases & Accounts Payable

**Status:** ✅ Complete — 2026-08-29
**Depends on:** Phases 2 and 3
**Blocks:** Phase 6 (bank reconciliation), Phase 7 (receiving stock)

## Goal

What the business buys, and what it owes — the mirror of Phase 4.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 5.1 | Bills, lines by expense or asset account | `prisma/schema.prisma`, `server/services/purchase.service.ts` | ✅ |
| 5.2 | Posting builder and edit-as-reverse-and-repost | `server/accounting/builders/purchases.ts` | ✅ |
| 5.3 | Expenses paid at once | shared pipeline | ✅ |
| 5.4 | Vendor credits and their application | `bill-payment.service.ts` | ✅ |
| 5.5 | Bill payments, partial and batch | `bill-payment.service.ts`, `components/purchases/bill-payment-form.tsx` | ✅ |
| 5.6 | Purchase orders and PO → bill conversion | `purchase.service.ts` | ✅ |
| 5.7 | AP aging, unpaid bills, vendor balances | `server/services/payables.service.ts` | ✅ |

## Deliberately the mirror of sales

`PurchaseDocument` is `SalesDocument` field for field wherever the meaning is the
same; `BillPayment` mirrors `CustomerPayment`; `PurchaseApplication` mirrors
`SalesApplication`, with the same four guards and the same wording in their error
messages.

That symmetry is the point. **Two subledgers that behave differently are a source
of bugs and of arguments; two that behave identically are one thing to learn.**

| Sales | Purchases |
| --- | --- |
| Invoice | Bill |
| Sales receipt | Expense |
| Credit memo | Vendor credit |
| Estimate | Purchase order |
| Customer payment | Bill payment |

## The journals

| Document | Journal |
| --- | --- |
| Bill | Dr cost per account · Dr tax · Cr AP (carrying the vendor) |
| Expense | Dr cost per account · Dr tax · Cr bank / credit card |
| Vendor credit | Dr AP (carrying the vendor) · Cr cost · Cr tax |
| Bill payment | Dr AP (carrying the vendor) · Cr bank |
| Purchase order | *nothing* — an order placed is not a transaction |

As on the sales side, the payment journal **touches no expense account**: the cost
was recognised when the bill was entered. A test asserts it has exactly two lines.

A test also asserts the bill journal is the mirror image of an invoice for the
same amounts, which is the cheapest way to keep the two sides honest as both
change.

## Where a cost lands

Every purchase line names an expense or asset account. It is resolved in order of
precedence — **the line, then the item, then the vendor's default** — and the form
pre-fills from the same chain, so routine spending is categorised the same way
every time.

If nothing answers, the posting engine falls back to **Uncategorised Expense**.
That is deliberate: money that went somewhere unnamed should be conspicuous on the
profit and loss rather than hidden in a plausible-looking account.

## Purchase tax

Where purchase tax lands is a property of the **tax rate**, not of the bill:

- **Recoverable** — point the rate's purchase account at an asset. The tax is a
  receivable from the authority.
- **Not recoverable** — point it at an expense account. The tax is part of the
  cost.

A rate used on a purchase with no purchase account at all is **refused**, because
silently dropping the tax would understate the cost of everything bought under
that rate. Keeping the decision in the chart of accounts means an accountant can
see and change it, rather than it being buried in a code path.

## Batch payment is the normal case

On pay day someone settles several bills from one bank transfer, so the payment
screen is built that way round: tick what you are paying, and the payment total
follows. "Pay all" fills every open bill.

## The guards

Ten more objects, bringing the total to **35** — the same set as sales, with the
same messages:

`purchase_applications_one_source`, `purchase_applications_positive`,
`trg_purchase_application_target` (only an open bill, never past its total),
`trg_purchase_application_source` (never past the payment's or credit's own
value), `trg_purchase_totals`, `purchase_documents_non_negative`,
`purchase_documents_payment_required`, `bill_payments_positive`, and the two
tenancy foreign keys.

## Verification

`pnpm verify` — lint clean, typecheck clean, **196 tests**. `pnpm build` clean.
`pnpm db:verify` — all 35 integrity objects present.

| Area | Covered |
| --- | --- |
| Builders (14) | every document's debits and credits against a fixed expected journal; the bill proved to be the mirror of an invoice; the vendor credit the mirror of the bill; the payment proved to touch no expense; a tax rate with no purchase account proved to be refused rather than dropped |
| Guards (9) | over-payment, over-drawing a payment, settling a purchase order, neither-source, negative totals, an expense with no payment account, totals disagreeing with lines, crossing organisations |

## What Phase 5 deliberately does not do

- Receiving tracked stock — Phase 7. `INVENTORY` items are refused on a bill for
  the same reason they are refused on an invoice: receiving stock has to value it,
  and the costing engine does not exist yet.
- Paying a bill straight from the bill screen. Payment is its own document,
  reached from Bill payments, so batch payment is not a second code path.
- Vendor statements and 1099-style reporting — Phase 8 and Phase 10.
