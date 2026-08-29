# ADR-0012 — The combobox is written here, the dialog is not

**Status:** Accepted · 2026-08-29 · Applies from Phase 10

## Decision
The searchable record picker (`components/ui/combobox.tsx`) is written by hand
with no new dependency. The modal dialog (`components/ui/dialog.tsx`) is built on
`@radix-ui/react-dialog`, which was already installed and unused.

## Rationale
These look like the same kind of decision and are not.

**The combobox is application logic.** It is also not a dropdown: the control is
the text box, so clicking it and typing is one motion rather than open-then-find-
the-search-field. A library's select would have had to be argued out of being a
select.

 The useful behaviour when the typed name
matches no record is to offer to create it, select it, and carry on — which means
the control knows about server actions, permissions and optimistic list merging.
The canonical shadcn combobox is Popover + Command (`cmdk`), two dependencies
that would have to be installed and then configured into doing something they
were not designed for. Roughly 300 lines that we own, and can read, is the better
trade for a control this specific. Keyboard behaviour is the whole point of it,
so it is written out explicitly rather than inherited.

**The dialog is not application logic.** A modal needs a focus trap, focus
return, Escape, a scroll lock, a portal and correct `aria-modal` wiring. Twelve
screens each had a `fixed inset-0` div and a click-to-close backdrop, and none of
them had any of that. This is exactly the code that is tedious to write once and
never written correctly twelve times, and Radix was already a dependency.

The line is: own the thing that encodes a decision about *this* product; borrow
the thing that encodes a decision about *the platform*.

## Consequences
The combobox renders its list into `document.body` and positions it in viewport
coordinates. It has to: every line table in the application scrolls horizontally
inside `overflow-x-auto` within an `overflow-hidden` card, which would clip an
absolutely positioned dropdown exactly where the picker matters most — on an
invoice line. The panel follows the trigger on scroll and resize, and flips above
it when there is no room below.

`@radix-ui/react-select` is now unused. It stays in `package.json` rather than
being uninstalled, since removing a dependency is a decision for a session that
can run the install.
