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
