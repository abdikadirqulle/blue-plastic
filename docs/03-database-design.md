# 03 — Database Design

PostgreSQL 15+ (Supabase), Prisma 7 schema in `prisma/schema.prisma`, raw SQL for
triggers and partial indexes in the migrations themselves.

Prisma 7 keeps connection URLs out of the schema: they live in `prisma.config.ts`,
and the client is constructed with a `@prisma/adapter-pg` driver adapter (see
[ADR-0008](./decisions/0008-prisma-7-driver-adapter.md)). Migrations use
`DIRECT_URL`, because DDL cannot run through a transaction pooler.

## Conventions

| Concern | Rule |
| --- | --- |
| Primary keys | `cuid()` text ids. Sequential integers leak volume to customers on shared documents |
| Tenancy | every business table carries `orgId` and is indexed on it first |
| Money | `Decimal @db.Decimal(19, 4)` |
| Quantities | `Decimal @db.Decimal(19, 4)` |
| Rates | `Decimal @db.Decimal(19, 9)` (exchange rates, tax rates) |
| Transaction dates | `DateTime @db.Date` — calendar dates, timezone-free |
| System timestamps | `DateTime @db.Timestamptz(6)` |
| Deletion | soft (`isActive` / `deletedAt`) for master data; documents are voided, never deleted |
| Naming | Prisma models `PascalCase` singular, tables `snake_case` plural via `@@map`. **Columns keep Prisma's camelCase field names**, so raw SQL must double-quote them (`"nextNumber"`, not `next_number`) |
| Enums | Postgres enums for closed sets that reports depend on |

## Table inventory by phase

Legend: **P1** Foundation · **P2** Accounting core · **P3** Master data · **P4** Sales/AR ·
**P5** Purchases/AP · **P6** Banking · **P7** Inventory · **P8** Reporting · **P9** Close

### P1 — Foundation and identity

| Table | Purpose |
| --- | --- |
| `organizations` | Tenant root. Legal name, base currency, fiscal year start month, date/number format, address, tax registration |
| `users` | Person. Email (citext-unique), name, hashed password, image |
| `memberships` | User ↔ organisation with `role`, `status`, `version` (bumping `version` invalidates issued JWTs) |
| `accounts` (NextAuth) | OAuth provider links — present so SSO is a config change later |
| `sessions`, `verification_tokens` | NextAuth adapter tables |
| `audit_logs` | `orgId, actorId, entity, entityId, action, before jsonb, after jsonb, at, ip, userAgent` |
| `document_sequences` | `orgId, docType, prefix, nextNumber, padding` — number allocation under row lock |

### P2 — Accounting core

| Table | Purpose |
| --- | --- |
| `ledger_accounts` | Chart of accounts. `code, name, type, subtype, parentId, systemKey, isActive, isSystem, description, currencyCode` |
| `fiscal_years` | `orgId, year, startDate, endDate, status` |
| `accounting_periods` | `fiscalYearId, periodNumber (0–12), startDate, endDate, status` |
| `journals` | `orgId, journalNumber, date, periodId, memo, sourceType, sourceId, status, isAdjusting, isClosingEntry, reversalOfId, currencyCode, exchangeRate, postedAt, postedById, idempotencyKey` |
| `journal_lines` | `journalId, orgId, lineNumber, accountId, debit, credit, description, customerId, vendorId, itemId, taxCodeId, foreignDebit, foreignCredit` |

`ledger_accounts` is named that way rather than `accounts` because NextAuth already
owns `accounts`. Renaming NextAuth's table instead would break adapter conventions
for no gain.

### P3 — Master data and tax

`customers`, `vendors`, `items` (service / inventory / non-inventory, with
`incomeAccountId`, `expenseAccountId`, `inventoryAccountId`), `item_categories`,
`payment_terms`, `tax_agencies`, `tax_codes`, `tax_rates`, `addresses`.

### P4 — Sales / AR

`invoices` + `invoice_lines`, `estimates` + `estimate_lines`, `sales_receipts`,
`credit_memos` + lines, `customer_payments`, `payment_applications`, `refund_receipts`.

### P5 — Purchases / AP

`bills` + `bill_lines`, `expenses` + `expense_lines`, `vendor_credits` + lines,
`bill_payments`, `bill_payment_applications`, `purchase_orders` + lines.

### P6 — Banking

`bank_transfers`, `deposits` + `deposit_lines`, `bank_reconciliations`,
`bank_reconciliation_lines`, `bank_rules` (later), `imported_bank_transactions`.

### P7 — Inventory

`inventory_transactions` (qty in/out, unit cost, running qty, running value, source
document), `inventory_adjustments` + lines.

### P8 — Reporting

`account_period_balances` — a rollup of `sum(debit), sum(credit)` per
`(accountId, periodId)`, maintained incrementally by trigger on `journal_lines`.
Introduced **only in P8**, and only as an optimisation: every report must still be
able to compute the same number from raw journal lines, and a test asserts the two
agree. A cache that cannot be verified against its source is a liability.

`saved_reports`, `report_schedules` (later, optional).

### P9 — Close

No new tables. Uses `journals.isClosingEntry` and `accounting_periods.status`.

## Key indexes

```sql
-- the index the general ledger, trial balance and every report leans on
CREATE INDEX journal_lines_org_account_date_idx
  ON journal_lines (org_id, account_id, journal_date, id);

-- subledger aging
CREATE INDEX journal_lines_org_customer_idx ON journal_lines (org_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX journal_lines_org_vendor_idx   ON journal_lines (org_id, vendor_id)
  WHERE vendor_id IS NOT NULL;

-- document lookup from a journal and back
CREATE INDEX journals_org_source_idx ON journals (org_id, source_type, source_id);
CREATE UNIQUE INDEX journals_org_number_key ON journals (org_id, journal_number);
CREATE UNIQUE INDEX journals_org_idem_key ON journals (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- period resolution on every post
CREATE INDEX periods_org_range_idx ON accounting_periods (org_id, start_date, end_date);
```

`journal_lines.journal_date` is denormalised from `journals.date`. It is redundant,
and it is worth it: every ledger and report query filters lines by date, and without
it each one pays a join to the header. The immutability trigger keeps it honest —
neither column can change after posting.

## Triggers (raw SQL, created in migrations)

| Trigger | Table | Timing | Enforces |
| --- | --- | --- | --- |
| `trg_journal_balanced` | `journal_lines` | `CONSTRAINT ... DEFERRABLE INITIALLY DEFERRED` | R2, R3 |
| `trg_journal_immutable` | `journals` | `BEFORE UPDATE OR DELETE` | R4 |
| `trg_journal_line_immutable` | `journal_lines` | `BEFORE UPDATE OR DELETE` | R4 |
| `trg_journal_period_open` | `journals` | `BEFORE INSERT` | R5, R6 |
| `trg_line_subledger_dimension` | `journal_lines` | `BEFORE INSERT` | R7 |

Prisma does not model triggers, so they live in `prisma/migrations/*/migration.sql`
and in `prisma/sql/` as readable source. `pnpm db:verify` re-asserts that every
expected trigger exists in the connected database — a dropped trigger is otherwise
completely silent until the day it matters.

## Referential rules

- `ON DELETE RESTRICT` everywhere by default. The only `CASCADE` is
  `journal_lines → journals`, which is unreachable in practice because posted
  journals cannot be deleted at all.
- Composite foreign keys `(orgId, xId)` on cross-entity references, so a row can
  never point at another organisation's record even if application code is wrong.
