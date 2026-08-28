# ADR-0004 — Server Components read, Server Actions write, TanStack Query for interaction only

**Status:** Accepted · 2026-08-28

## Decision
Pages fetch by calling the service layer directly from Server Components. Mutations
go through Server Actions calling the same services. Route handlers and TanStack
Query are reserved for typeahead search, infinite registers, and future external
consumers.

## Rationale
The common Next.js pattern — a route handler per entity, fetched by TanStack Query
from a client page — pays for JSON serialisation, an HTTP round trip and a client
render on every page load, and turns every list into a loading spinner. Calling the
service directly on the server removes all three. The parts of the app that are
genuinely interactive (a customer combobox that filters as you type) still need a
client cache, so TanStack Query stays — scoped to those.

## Consequences
Two data-fetch idioms in the codebase. The rule for choosing is written in
`01-architecture.md §3` and is unambiguous: if the server can render it, the server
renders it.
