# Phase 10 — Interface and hardening

**Status:** ✅ Complete — 2026-08-29
**Depends on:** every earlier phase
**Blocks:** nothing — this is the last planned phase

## Goal

The accounting has been right since Phase 2. This phase is about the twenty
minutes a day somebody spends in front of it: fewer places to look, less typing,
nothing that makes them wait without saying so.

## Tasks

| # | Task | Where | Status |
| --- | --- | --- | --- |
| 10.1 | Sidebar reduced to modules; everything else becomes a tab inside one | `components/layout/nav-items.ts`, `module-tabs.tsx` | ✅ |
| 10.2 | Searchable pickers with inline create for customers, vendors and items | `components/ui/combobox.tsx`, `forms/entity-picker.tsx` | ✅ |
| 10.3 | One dialog primitive; one select primitive; twelve hand-rolled modals retired | `components/ui/dialog.tsx`, `native-select.tsx` | ✅ |
| 10.4 | Navigation progress indicator | `components/layout/navigation-progress.tsx` | ✅ |
| 10.5 | Frontend performance pass | see below | ✅ |
| 10.6 | Command palette and keyboard shortcuts | `lib/shortcuts.ts`, `layout/command-palette.tsx` | ✅ |
| 10.7 | Help and system guidance inside the application | `app/(app)/help/` | ✅ |
| 10.8 | Quick Create — one button that starts any document or record | `components/layout/quick-create.tsx` | ✅ |
| 10.9 | Calendar date picker in place of the browser's date input | `components/ui/calendar.tsx`, `date-field.tsx` | ✅ |
| 10.10 | Sortable column headers and pagination on the list screens | `components/data/sortable-header.tsx` | ✅ |
| 10.11 | Default accounts: which account each system role posts to | `app/(app)/settings/accounts/` | ✅ |
| 10.12 | One answer to "delete this", for every transaction type | `lib/document-disposition.ts`, `components/data/document-disposal.tsx` | ✅ |
| 10.13 | Voiding and editing now reverse the **stock** as well as the journal | `server/accounting/inventory.ts` | ✅ |
| 10.14 | Every account selector offers the whole chart, ordered by relevance | `lib/account-options.ts`, `components/forms/account-picker.tsx` | ✅ |
| 10.15 | Inventory items are selectable on sales and purchase documents again | `server/services/sales-options.ts`, `purchase-options.ts` | ✅ |
| 10.16 | Inventory and stock unified: an item is created with its stock | `components/master-data/item-dialog.tsx`, `server/services/item.service.ts` | ✅ |
| 10.17 | Journals name their document and their counterparty, and link back | `server/services/journal-sources.ts` | ✅ |
| 10.18 | Expenses (purchase receipts) settle on entry and stop showing a balance | `server/services/purchase.service.ts` | ✅ |
| 10.19 | Pay Bills rebuilt: tick bills, see what is left, see the account balance | `components/purchases/bill-payment-form.tsx` | ✅ |
| 10.20 | Fifteen new reports on one framework, and QuickBooks-style periods | `server/reports/catalogue.ts`, `lib/report-periods.ts` | ✅ |
| 10.21 | Statements — customer, vendor and account | `app/(app)/reports/statements/[kind]/` | ✅ |
| 10.22 | Visual system rebuilt on an Odoo-like footing | `app/globals.css`, `components/ui/` | ✅ |

## 10.1 — Nine modules, with their screens underneath

The sidebar listed twenty-two destinations under five headings. That is a table
of contents, not a navigation. Somebody doing the books thinks in terms of
*sales* or *purchases*; which document they need is the second question.

So: Dashboard, Sales, Purchases, Banking, Inventory, Accounting, Reports,
Settings, Help — each expanding to show its own screens. The module you are in is
open, the others are closed until you ask, and a chevron overrides that. It was
briefly a tab row across the top of the page instead; the sidebar tree is better,
because it shows where you are *and* what else is there without a click.

No routes moved. The module a URL belongs to is derived from a list of path
prefixes (`moduleFor`), which is what makes `/customers/{id}` and
`/sales/invoices/new` light up the right entry without either of them knowing it
is inside a module. Settings and Reports had their own tab components in their
own layouts; both are deleted for the one implementation in the shell.

Products & services sits under Inventory rather than Sales. Items are sold, so
Sales has a claim on them, but they are also counted, valued and reordered, which
is more of the work — and one module has to own the route or the navigation moves
under the user when they click it.

**The sidebar is pinned to the viewport** (`sticky top-0 h-svh`) with its own
scroll region. It was scrolling away with the page, which on a long report meant
no navigation by the time you reached the bottom.

## 10.2 — Pickers that search, and create

Every list of *records* — customers, vendors, items, accounts — is now a
searchable combobox. The control **is** the text box: click it and type, and the
list underneath narrows as you go. There is no separate search field inside a
popup, because a second box to find your way to is a step, and this is the
most-used control in the application.

Arrows move, Enter chooses, Escape closes and restores, Backspace on an empty box
clears the selection — the behaviours a text field already has.

Where the record might not exist yet, typing a name that matches nothing offers
to create it as the **first** row in the list: at that point it is the only thing
left to do, so it belongs under the cursor rather than below a list of
near-misses.

Choosing it opens that record's **real** dialog, with the typed name filled in.
The first attempt created the record from the name alone, and that was wrong: an
item needs its income, inventory and cost-of-sales accounts, and a form that
silently picked those produces an item posting to the wrong place. Three fields
to fill in is a smaller cost than a mis-posted sale. The dialog hands the new
record back through the form state, so it is selected the moment it is saved.

The dialog's own option lists — payment terms, accounts, tax codes — are fetched
when it opens (`app/(app)/quick-create/actions.ts`), so an invoice screen does not
load them on the chance that a customer turns out to be missing.

**Accounts are deliberately not creatable this way.** An account needs a type and
a subtype that determine where it lands on the balance sheet, and guessing those
from a name typed into a dropdown is how a chart of accounts becomes a mess.

## 10.3 — Two primitives, not twelve implementations

Twelve screens each had a `fixed inset-0` div with a click-to-close backdrop, and
none of them had a focus trap, focus return, Escape, or a scroll lock. All twelve
now use one `Dialog` on Radix — a dependency that was already installed and never
used. Ten screens each declared the same `selectClass` string; that string is now
`NativeSelect`, once.

Short fixed lists — a payment method, a filing frequency, a tax code — stay
native selects on purpose. The platform control is faster to use, works properly
on a phone, and needs no JavaScript. See
[ADR-0012](../decisions/0012-owned-combobox-and-dialog.md) for why the combobox
is written here and the dialog is not.

## 10.4 — The bar at the top

There is no router event to subscribe to in the App Router, so the indicator is
assembled from what is observable: a capture-phase click on any internal link
starts it, a change of pathname or query string finishes it, and
`startNavigationProgress()` is exported for code that calls `router.push` itself.

It waits 120 ms before appearing. A navigation that resolves faster than that
would otherwise produce a flash of bar, which reads as slower than no bar at all.

## 10.5 — What the performance pass actually changed

**TanStack Query left the root layout.** It was mounted in the global provider
and used by exactly one screen — the activity log's infinite list. The library
compiles to a 39 KB chunk that every page was pulling into its first load for
nothing. The provider now lives in `components/providers/query-provider.tsx` and
is mounted by that one page.

**Route-level skeletons** for reports, sales and purchases, drawn at the real
control-bar and table dimensions so nothing shifts when the data lands. Reports
are the slowest screens in the application — around 520 ms against a
fifty-thousand-line ledger, most of it network round-trip — and are the ones that
most need to show their shape first.

**The create dialogs are code-split.** `ContactDialog` and `ItemDialog` are among
the largest components in the application and are loaded only when somebody
actually opens one, rather than by every form that has a picker on it.

**No unnecessary client components.** The ones added by this phase — the tabs, the
progress bar, the palette — are the chrome, and each exists because it reads the
current pathname or listens for a key. Every page and every report added in
Phases 8 and 9 remains a Server Component.

**What was deliberately not done:** the document forms still receive the full list
of customers, items and accounts as props. For a business of this size that is
one query and a few kilobytes, and it makes the picker instant. A server round
trip per keystroke would be slower and more code. Revisit at a few thousand
records, not before.

## 10.6 — Keyboard

Two-key sequences with a verb prefix: `g` to go somewhere, `c` to create
something. It leaves single letters free for the page itself, and nothing is
bound to a bare modifier chord except the palette on ⌘K.

Every shortcut is declared once in `lib/shortcuts.ts`. The palette, the key
handler and the help page all read that list, so a shortcut cannot work but be
undocumented, or be documented but not work. Keys are ignored while focus is in a
field — somebody entering a customer called "Gigi" should not be navigated away
mid-word.

## 10.7 — Help, inside the application

There is no separate documentation site, which is right for a system with one
organisation using it: a manual nobody opens is worse than no manual, and the
moment somebody needs an answer they are already here.

Three pages: the order of work (setting up, a sale end to end, a purchase end to
end, every month, every year), the rules that will not bend and why, and the
keyboard shortcuts. What belongs there is what the screens cannot say for
themselves. What does not belong is a description of which button is where.

## 10.8 — Quick Create

One button in the header opens a panel of everything that can be started, in four
columns: customers, vendors, banking, other. Documents navigate; records that are
dialogs — a customer, a vendor, a product — open as dialogs, so adding one does
not throw away the page you were on.

The alternative is remembering which module a refund receipt lives under before
you can begin one, which is a thing about the filing system rather than about the
work.

## 10.9 — Dates

The browser's `type="date"` is inconsistent between browsers, ignores the
application's own typography, and on some platforms cannot be typed into at all.
`DateField` replaces all seventeen of them: a text box that still takes typing —
`4/3`, `04/03/2026`, or `4` for the fourth of the current month — with a calendar
attached for when you need to see where a date falls.

The calendar is written here, on `lib/date`, rather than taken from a date
library. What it has to be right about is the *calendar date*, not an instant:
every date in this system is a `YYYY-MM-DD` string, an invoice dated the 1st is
dated the 1st in every timezone, and a picker built on `Date` objects is one
daylight-saving boundary away from posting an entry into the wrong month.

## 10.10 — Sorting and pagination

Column headers sort. The sort lives in the URL alongside the page number and the
search, so the ordering survives a refresh and can be sent to somebody else — and,
more importantly, the sort happens **in the database over every row**, not in the
browser over the page that happens to be loaded. Sorting only the visible page is
the bug this design avoids.

Applied to every list in the application: the chart of accounts and the account
register, sales and purchase documents, journals, customer and bill payments,
customers, vendors, products, stock on hand, bank accounts, users, payment terms,
the trial balance, both ageing reports, the four trade reports and the tax
summary.

Where a column is stored, the ordering is a `Prisma.orderBy` and the database
does it over every row. Where it is computed — a journal's total, an item's stock
value, an account's balance, an ageing bucket — the whole set is already in
memory and it is sorted there. Columns that cannot be sorted are left as plain
headers rather than offered and then ignored.

**Four tables are deliberately not sortable**, and it is worth saying why:

- **Financial statements** — profit and loss, balance sheet, cash flow. Their row
  order *is* the statement. Sorting a balance sheet by amount produces something
  that is no longer a balance sheet.
- **Accounting periods** — chronological by definition; period 4 after period 3 is
  not a preference.
- **Document line tables** — an invoice's lines are in the order they were
  entered, and that order is part of the document.
- **The activity log** — an append-only audit trail, read newest first, loaded by
  infinite scroll.

The account register is sortable but its running-balance column is only
meaningful in date order, so the header renames itself to "Balance (in date
order)" when the register is sorted by anything else, rather than showing a
number that no longer describes the row above it.

The chart of accounts was one long ungrouped table; it is now one sortable,
paginated table of 25. Its balances are coloured: positive bold green, negative
bold red. That is not good-and-bad — every balance there is shown on its account's
natural side, so a negative figure is a *contra* position (a bank overdrawn, an
expense in credit) and those are exactly the rows worth finding on a page of
numbers. Zero stays plain, because a page where everything is coloured is a page
where the colour means nothing.

Indentation showing the parent/child structure is dropped when the table is
sorted by anything other than account number. A child three rows away from its
parent, indented under nothing, would be misleading rather than helpful.

The balance colouring is deliberately **not** applied to the account detail page:
its running balance is debit-minus-credit, not natural side, so a revenue account
reads negative there and red would be simply wrong.

## 10.11 — Default accounts

The engine never names an account. It asks for a *role* — the receivable control
account, the account uncategorised income lands in — and Settings → Default
accounts is where a role is bound to an account. Every invoice, bill, payment and
closing entry resolves through those bindings, so changing one changes what every
form does without any form knowing about it.

The schema used to say these were "seeded once, never reassigned". A business
with its own chart should be able to say *our receivables account is 1150* rather
than be told what to call things, so they can now be moved — with guards. A role
only accepts an account of the right type and detail type, because putting
receivables on an expense account puts it in the wrong half of the balance sheet.
An archived account, a heading with sub-accounts, and an account already holding
another role are all refused.

**Rebinding does not move a balance.** Entries already posted stay on the account
that received them; the ledger records what happened and is not rewritten to match
a later preference. The screen says so before the change, with a count of the
entries that will be left behind, and the change is written to the audit log.

## 10.12 — Two bugs in the form plumbing

Both found by the owner using it, and both one line deep.

**A form could be submitted twice.** `SubmitButton` computed
`disabled={pending || props.disabled}` and then spread `{...props}` *after* it,
so the caller's own `disabled` — usually `undefined` — overwrote the computed
value. The button stayed live for the whole round trip and a second click posted
the document a second time. The spread now comes first. Seven document forms were
also using a bare `<Button type="submit">` with no pending state at all; they use
`SubmitButton` now, so every form in the application disables its own button and
shows a spinner while it is saving.

**A successful save announced itself in red.** Forms rendered
`<FormError message={state.message} />` unconditionally, and `state.message`
carries the *success* text as well as the failure text — so saving an invoice
displayed "INV-0001 saved." in the destructive banner. `FormStatus` already
existed to make that distinction and was not being used. All seventeen call sites
now use it: red on failure, green on success, nothing before either.

## 10.13 — Actions, print and export

**Edit.** The document forms and the update services always supported editing —
`saveDocumentForm` has branched on the presence of an id since Phase 4 — but
there was no route rendering the form with a document in it. There is now, for
both sales and purchases, reached from an Edit button on the detail page and from
the row menu. Saving reverses the original journal and posts a replacement
(ADR-0002); nothing is rewritten.

The button follows the same rule the service enforces rather than restating it:
hidden for a voided document, and hidden once a payment or credit has been
applied, because the application would have to be unpicked first. Better to hide
the button than to explain the refusal afterwards.

**Row menus** carry navigation only — open, edit, print. Voiding keeps its own
button on the record's own page, where there is room to say what it will do
before it does it. A destructive action two clicks deep in a row menu, with a
table of near-identical rows around it, is how the wrong invoice gets voided.
Payments have no detail page, so their rows have no menu rather than a menu whose
only entry is a dead link.

**Print** uses the browser. The print stylesheet already hid the shell; it now
also unwraps the scroll containers, because an `overflow` container prints only
what was visible and silently truncates the table.

**Export is CSV, not `.xlsx`.** Excel opens it directly — the file carries a
byte-order mark and CRLF endings for exactly that reason — and every amount
arrives as a number rather than as text, which is what people mean when they ask
for an Excel export. A real `.xlsx` would put a spreadsheet library in the bundle
to produce a file that opens the same way. The export covers **every row the
current filter matches**, not the page on screen: exporting page 2 of 7 without
saying so is the kind of quiet wrongness that ends up in somebody's board pack.

**A tax column that is not there.** With no tax codes configured, the tax column
on invoice and bill lines is hidden entirely, along with the tax line in the
totals. An empty dropdown reading "No tax" on every line is a question the form is
asking and already knows the answer to.

**Country stopped being mandatory.** `countryCode` was
`.length(2).nullable().optional()` — which accepts an *absent* value, but a form
always submits `""` for a field left blank, and `""` is not two characters. Every
contact whose country was not filled in was rejected. It now treats the empty
string as nothing, like every other optional field in the schema.

## 10.14 — Category lines and item lines are not the same thing

A bill's line table used to ask for a product **and** a category on every row.
Two selectors side by side make the two look interchangeable. They are not:

- A **category** line is an accounting entry — rent, fuel, a professional fee. It
  names the account the cost lands in and an amount. Nothing is counted.
- An **item** line is a thing that was bought. It names a product, a quantity and
  a unit cost, and if the product is tracked the purchase moves stock and the
  cost sits in inventory until it is sold.

Put stock on a category line and it never reaches the stock ledger. Put rent on
an item line and you have invented a product called rent.

So the purchase form now has two sections, as QuickBooks does: **Category
details** and **Item details**. A bill genuinely needs both — that is how stock
arrives *and* how the electricity bill is recorded — so both are offered, and
each row asks only what its kind requires.

Sales documents get the opposite treatment: **one** section, product and service
only. An invoice line's income account comes from the item on it, so a category
selector there would be a second way of saying the same thing, and the two would
eventually disagree.

**No server change was needed**, which is the sign the model was already right.
`purchaseLineSchema` has always accepted either shape — a line with an
`expenseAccountId` and no item, or a line with an `itemId` — and `resolveLines`
already derived a tracked item's inventory account itself. The split was a
statement about *entry*, not about storage, and the two shapes still travel in
one list because that is how the document holds them.

An item line now sends no account at all. It used to send one copied from the
item, which was harmless but wrong in principle: for a tracked item the cost goes
to inventory rather than to an expense account, and only the server knows whether
an item is stocked.

The purchase detail screen distinguishes them too — an item line shows its
product and its quantity, a category line shows its account and leaves quantity
and unit cost blank, because 1 × the amount is arithmetic nobody entered.

## 10.12 — What "delete this" means

Nothing could be deleted. Sales and purchase documents could be *voided* from
their own pages; a bank transfer entered twice, a stock count against the wrong
item, a payment to the wrong vendor — none of those had a way back at all. And a
draft invoice raised by mistake stayed in the list for ever, because the rule
"posted entries are immutable" had been applied to documents that were never
posted.

There are two honest answers, and which one applies is a property of the record
rather than of the screen. `lib/document-disposition.ts` decides it in one place:

| Situation | Answer | Why |
| --- | --- | --- |
| No journal — a draft, an estimate, a purchase order | **Delete** | The ledger has never seen it and nobody holds the number |
| Posted | **Void** | The journal is reversed, stock comes back, the document is kept |
| Payments or credits applied | **Blocked**, with the reason | Removing them first is a decision, not a side effect |
| Already converted, or already void | **Blocked**, with the reason | Something else points at it |

`components/data/document-disposal.tsx` is the one control, and it reads that
function — so a screen cannot offer something the server will refuse. It is wired
into sales documents, purchase documents, customer payments, bill payments, bank
transfers, deposits and inventory adjustments. The last four had no disposal
control of any kind before; transfers and deposits had no list page to put one
on, so `/banking` now lists them.

`server/services/{sales,purchase}.service.ts` gained `remove()`, which refuses
anything the disposition says is not deletable rather than trusting the caller.

## 10.13 — Voiding reversed the money but not the goods

A real integrity bug, and the worst kind: silent, and it moves in one direction.

Voiding a bill reversed its journal, which took the stock value back out of the
Inventory Asset account — but the stock ledger kept the goods. The two records of
what the business owns then disagreed, which is precisely the condition
`stockAgreesWithLedger` exists to detect. **Editing** was the same bug one step
worse: the new movements were added on top of the old ones, so every edit of a
bill inflated the stock and its value.

`reverseMovementsFor` undoes a document's movements with exact opposites: the
same quantity the other way at the same unit cost, so the value removed equals
the value the journal reversal removes, to the cent. Nothing is deleted — the
stock ledger is append-only for the same reason the general ledger is — and the
compensating row carries the reversing journal's id, so both ledgers tell the
same story about the undo. Reversing *every* movement of a document, including
compensating ones from an earlier edit, makes the document's net contribution
zero whatever its history, which is what makes this safe to call twice.

Two smaller costing bugs went with it:

- A bill carrying the same item on two lines costed both at the **first** line's
  amount, because the priced line was looked up by item id. It is matched by
  position now.
- An inventory adjustment could not be voided at all. It can, and doing so puts
  the stock back exactly as it was.

## 10.14 — Account selectors show the chart, not a slice of it

Every account selector filtered the chart to the subtypes its screen expected. A
business that keeps petty cash in an "Other current asset" could not pay a bill
out of it; a business whose sales land in "Other income" could not point an item
at it. The chart of accounts is the business's own, and a form that hides two
thirds of it forces the wrong answer.

The rule now, everywhere: **relevance is ordering, never filtering.** The
expected accounts come first under a *Suggested* heading, the rest of the chart
follows grouped by statement type, and every row names the kind of account it is
— which is also searched, so typing "bank" finds the bank accounts whatever they
happen to be called. `lib/account-options.ts` builds it; `AccountPicker` renders
it; the payment screens add the account's balance beside the name.

Three narrowings survive, all because they are accounting rules rather than
convenience:

- A **manual journal** cannot touch receivables, payables or inventory. They are
  control accounts whose balances are the sum of a subledger, and the posting
  engine refuses it (R7/R8) — leaving them out of the picker is kinder than
  letting somebody choose one and be refused on submit.
- A **transfer or deposit** is between balance-sheet accounts. Moving money to
  "Sales" is not a transfer, it is a sale. That check moved from a list of three
  subtype names to the statement type, which is the thing that actually matters
  — so petty cash, mobile-money floats and director's loans all work now.
- A **system account role** (Settings → Default accounts) still takes only
  accounts of the right detail type. The receivables control account has to be a
  receivables account or the ageing report cannot find it; that constraint is
  structural, was already as loose as it can safely be, and the service enforces
  the same rule the picker shows.

## 10.15 — Inventory items had been made unsellable

`sales-options.ts` and `purchase-options.ts` both carried
`type: { not: 'INVENTORY' }` in their item query — a Phase 4 measure from before
stock existed, never removed when Phase 7 landed. The effect was that the only
items offered on an invoice or a bill were services and non-inventory goods, so
a tracked product could not be sold or received through the interface at all.

Both now load every active item, grouped by kind, with stock on hand shown beside
anything tracked.

## 10.16 — Inventory and stock are one thing

They were two: a *Products & services* screen that created items, and an
*Inventory* screen that valued them, with no way to get stock into a new item
except by finding a third screen. The item dialog even said so, in a note
explaining that there was deliberately no opening-quantity box.

That was the wrong call. Stock is a property of an item, not a register kept
beside it. Creating an inventory product now asks for its stock accounts, its
reorder point and **what is on the shelf today** — and the opening quantity posts
as a real movement into the inventory account against Opening Balance Equity, so
the item is countable and sellable the moment it exists. The products list shows
on-hand and stock value; the Inventory screen is the valuation view of the same
records, and the module opens on the products list.

## 10.17 — A journal that says what it came from

A journal knew its `sourceType` and `sourceId`, so the list could say "Invoice"
and nothing more — not which invoice, not who it was for. That is the wrong way
round: nobody looks up a journal for its own sake. They are looking at a figure
on a report and want to know what caused it, and the two questions they are
actually asking are *which document* and *who*.

`server/services/journal-sources.ts` resolves both, in one batch per document
family rather than one query per row, for every source type in the system —
including an opening balance, which now names the account or the item it opened.
The list gained Document and Customer/vendor columns, both linked; the detail
page names the party on every line that carries one (which is R7 paying off); and
the search box matches a customer or vendor name as well as a journal number.

## 10.18 — Expenses, or purchase receipts

An expense is the purchase-side mirror of a sales receipt: bought and paid at
once, never a payable. It was not behaving like one.

- Its status stayed `OPEN` for ever, because `refreshStatus` only handled bills.
  A settled purchase therefore appeared on every unpaid list.
- Its outstanding balance was computed as `total − applications` — and nothing is
  ever applied to an expense, so it read as if the whole amount were still owed.
- The account it was paid from was never validated. A missing one surfaced as a
  bare `Error` from the journal builder with no field to point at.

All three are fixed: an expense is `PAID` the moment it posts, only a bill
reports an outstanding balance, and the payment account is checked before
anything is written. `/purchases/purchase-receipts` reaches the same screen,
because half the world's accounting software uses that name for this document.

## 10.19 — Pay Bills

The screen now follows the order the work is actually done in — vendor, what is
owed, tick what is being settled, say where the money comes from — and shows the
two things somebody is actually deciding on:

- **What is left after this payment**, per bill, updating as the amount is typed.
  Paying part of a bill is normal and the next question is always "and then how
  much is still owed?".
- **What is in the account.** The balance sits beside the account name, so "pay
  all" against an account that cannot cover it is a decision made before the
  button rather than after the bounce.

Bills carry their age, their original total and what has already been paid;
ticking one fills in its balance; over-applying is refused with a reason rather
than a silent server error. Vendor credits are listed alongside and can be
applied to the oldest bills in one action — a credit nobody can see is a credit
nobody uses.

## 10.20 — Reports

Twelve reports became twenty-seven, and the period control became the one people
expect: Today, This week, Last week, This month, Last month, This quarter, Last
quarter, This year, Last year, Year to date, All dates, Custom — with the year
meaning the *fiscal* year, said in the label rather than in a footnote.

The three financial statements keep their own pages, because each has a shape of
its own. Everything else is the same object — a title, some columns, some rows, a
total — so `server/reports/catalogue.ts` declares them as data and one page
renders them. That is what keeps the period handling, the export link, the
drill-down and the empty state identical across all of them, and identical when
the next one is added. The CSV route runs the same builder, so the file cannot
disagree with the screen.

One correctness fix came with the period work: **"as at" no longer runs ahead of
today** unless a date is typed. A period's end and the date a position is stated
at are not the same thing — choosing "This year" in August and getting an ageing
report as at 31 December marked every invoice not yet due as overdue, because the
comparison was against a date four months away. The default is now the earlier of
the period end and today, and a period wholly in the past still states its own
end, which is what "Last year" is asked for.

New: customer balances, open invoices, payments received, vendor balances,
unpaid bills, payments made, expenses by vendor, purchases by item, product
profitability, stock valuation, stock movements, reorder list, general ledger,
journal report, account balances. The ageing reports gained the period control
and a CSV export they did not have.

*Product profitability* is worth a note: its cost comes from the stock ledger —
what was actually issued, at the average it was issued at — not from the item's
purchase price. Costing it from master data would report a margin nobody earned.

## 10.21 — Statements

Three kinds, one page, because they are the same document about three different
things: a subject, a period, an opening balance, every movement in date order, a
closing balance. Splitting them into three pages would mean three places for the
running balance to be computed differently.

- **Customer** — what they owe and what they were sent. This is the document
  posted or emailed when somebody asks "what do I owe you?".
- **Vendor** — the mirror, and new: `payables.vendorStatement`.
- **Account** — every posted line on one ledger account with a running balance.

Each line links to the document behind it, and the page prints as paper — the
existing `@media print` rules strip the shell, which is also how a PDF is
produced. A customer statement existed in `receivables.service` since Phase 4 and
had never been rendered anywhere.

## 10.22 — The visual system

Odoo as the reference, and what is worth taking is not the purple — it is the
discipline. A business application is looked at for seven hours a day by somebody
who is not looking at *it*; they are looking at a number in it.

- **The page recedes.** White panels on a soft grey ground, no drop shadows.
  One panel is not in front of another, so there is no depth to communicate.
- **Small corners.** 4px, not 12px. A rounded rectangle reads as an object, and a
  table of two hundred rows is not two hundred objects.
- **Density is the feature.** Rows, inputs and buttons at 32px rather than 36–40,
  and a 13px base. The difference between eighteen visible rows and twenty-six is
  the difference between scrolling and not.
- **One accent, sparingly.** A deep plum for the primary action and for anything
  selected; everything else grey. When one thing on screen is coloured, it does
  not need to be loud.

Applied at the token and primitive level — `globals.css`, `button`, `card`,
`table`, `input`, `native-select`, `badge`, `combobox`, `date-field`, `dialog`,
`dropdown-menu` — plus the shell, the sidebar, the page header and the empty and
loading states, so it propagates rather than being re-applied screen by screen.
Two utility classes, `.section-label` and `.panel-head`, replace a string that
fifteen files were each declaring.

What is deliberately *not* Odoo: the typography stays on the system stack,
amounts stay tabular, and the palette keeps its own colour rather than copying a
brand that belongs to somebody else.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm build` clean; `pnpm test` 292 passed in 27
files (was 272 in 25). New tests:

- `lib/account-options.test.ts` — a selector never drops an account; relevance is
  ordering; the kind is always named.
- `lib/document-disposition.test.ts` — which of delete, void and blocked applies.
- `tests/report-presentation.test.ts` — the new period presets, including that a
  business week runs Monday to Sunday.
- `tests/inventory-costing.test.ts` — reversing a document's stock: it comes out
  at the cost it went in at, two lines of one item net to one row, calling it
  twice still leaves nothing behind, and it lets stock go negative rather than
  trapping a wrong bill in the books.

**Not verified:** none of this has been clicked through in a browser. The stock
reversal is covered at the level of `reverseMovementsFor`; there is still no test
that drives `voidDocument` end to end on a bill carrying stock and then asserts
`stockAgreesWithLedger`. That is the next test worth writing.

## What Phase 10 does not do

- No attachments on documents, no full-text search, no rate limiting, no
  multi-currency activation, no backup runbook. These were listed in the original
  Phase 10 sketch and remain unbuilt.
- No end-to-end browser test suite. That is the honest gap left by this phase,
  and the thing most worth building next.
