# ADR-0003 — NUMERIC(19,4) and Decimal, never float, never number

**Status:** Accepted · 2026-08-28

## Decision
Money is `NUMERIC(19,4)` in Postgres, `Prisma.Decimal` in Node, a decimal **string**
on the wire, and formatted text in the DOM.

## Alternatives considered
**BIGINT minor units.** Exact and fast, and avoids a decimal library entirely. It
was rejected because unit prices and quantities in this business are genuinely
fractional (price per kg, part-unit quantities), and representing a
$0.0125-per-unit price in integer cents forces a second scale factor that leaks into
every calculation.

**Float.** Never.

## Consequences
`Decimal` values must be explicitly serialised at every server/client boundary; a
lint rule and the action wrapper handle this. Rounding is explicit and centralised
in `lib/money.ts` rather than implicit at each call site.
