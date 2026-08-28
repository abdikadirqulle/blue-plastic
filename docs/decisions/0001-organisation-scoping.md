# ADR-0001 — Organisation scoping from day one

**Status:** Accepted · 2026-08-28

## Context
Blue Plastic Center is one business. A single-tenant schema would be simpler today.

## Decision
Every business table carries `orgId`, indexed first, and every service takes an
`OrgContext` whose `orgId` comes from the session.

## Rationale
Adding a tenant key later means backfilling every table, rewriting every query and
re-verifying every report against live financial data. The cost now is one column
and one `where` clause; the cost later is a migration nobody can safely perform on a
ledger. It also gives the accountant-access and future multi-entity cases (a second
legal entity, a holding company) for free.

## Consequences
Slight query verbosity. Enforced by an integration test that asserts cross-tenant
reads return nothing.
