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

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all clean. The test
suite is unchanged by this phase: it covers the ledger, and this phase did not
touch the ledger.

**Not verified:** none of this has been clicked through in a browser. The
conversions were mechanical and are typechecked, but a keyboard trap, a clipped
dropdown or a tab that reads as inactive on the wrong route would not show up in
any check that has been run.

## What Phase 10 does not do

- No attachments on documents, no full-text search, no rate limiting, no
  multi-currency activation, no backup runbook. These were listed in the original
  Phase 10 sketch and remain unbuilt.
- No end-to-end browser test suite. That is the honest gap left by this phase,
  and the thing most worth building next.
