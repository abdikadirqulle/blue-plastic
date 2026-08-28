# ADR-0007 — NextAuth v5 with JWT sessions and a membership version

**Status:** Accepted · 2026-08-28

## Context
NextAuth v5's credentials provider requires the JWT session strategy; database
sessions are not available with it. JWTs cannot be revoked server-side.

## Decision
JWT sessions carrying `userId`, `orgId`, `role` and `membershipVersion`. Every
request compares the token's `membershipVersion` against the membership row. Any
change to a user's role or status increments that version, so a revoked or demoted
user loses access on their next request rather than at token expiry.

## Rationale
This buys database-session revocation semantics for the cost of one indexed lookup,
while keeping the credentials provider and edge-safe middleware.

## Consequences
Route protection in middleware uses the edge-safe config and only checks that a
token exists; the authoritative permission check happens in
`requireOrgContext()` on the Node runtime, where the database is reachable.
Middleware is a redirect convenience, never a security boundary.
