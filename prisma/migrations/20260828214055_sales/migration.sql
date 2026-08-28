-- CreateEnum
CREATE TYPE "SalesDocumentType" AS ENUM ('INVOICE', 'ESTIMATE', 'SALES_RECEIPT', 'CREDIT_MEMO', 'REFUND_RECEIPT');

-- CreateEnum
CREATE TYPE "SalesDocumentStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'VOID', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER');

-- CreateTable
CREATE TABLE "sales_documents" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "SalesDocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "paymentTermId" TEXT,
    "expiryDate" DATE,
    "status" "SalesDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "memo" TEXT,
    "customerMessage" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(19,9) NOT NULL DEFAULT 1,
    "depositAccountId" TEXT,
    "journalId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "convertedFromId" TEXT,
    "voidedAt" TIMESTAMPTZ(6),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

CONSTRAINT "sales_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_document_lines" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "lineNumber" SMALLINT NOT NULL,
    "itemId" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(9,4),
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "incomeAccountId" TEXT,
    "serviceDate" DATE,

CONSTRAINT "sales_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "memo" TEXT,
    "depositAccountId" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(19,9) NOT NULL DEFAULT 1,
    "journalId" TEXT,
    "status" "SalesDocumentStatus" NOT NULL DEFAULT 'OPEN',
    "voidedAt" TIMESTAMPTZ(6),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_applications" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "paymentId" TEXT,
    "creditDocumentId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "sales_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_convertedFromId_key" ON "sales_documents"("convertedFromId");

-- CreateIndex
CREATE INDEX "sales_documents_orgId_type_status_date_idx" ON "sales_documents"("orgId", "type", "status", "date" DESC);

-- CreateIndex
CREATE INDEX "sales_documents_orgId_customerId_date_idx" ON "sales_documents"("orgId", "customerId", "date" DESC);

-- CreateIndex
CREATE INDEX "sales_documents_orgId_dueDate_idx" ON "sales_documents"("orgId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_orgId_type_number_key" ON "sales_documents"("orgId", "type", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_id_orgId_key" ON "sales_documents"("id", "orgId");

-- CreateIndex
CREATE INDEX "sales_document_lines_orgId_itemId_idx" ON "sales_document_lines"("orgId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_document_lines_documentId_lineNumber_key" ON "sales_document_lines"("documentId", "lineNumber");

-- CreateIndex
CREATE INDEX "customer_payments_orgId_customerId_date_idx" ON "customer_payments"("orgId", "customerId", "date" DESC);

-- CreateIndex
CREATE INDEX "customer_payments_orgId_status_idx" ON "customer_payments"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_orgId_number_key" ON "customer_payments"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_id_orgId_key" ON "customer_payments"("id", "orgId");

-- CreateIndex
CREATE INDEX "sales_applications_orgId_invoiceId_idx" ON "sales_applications"("orgId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_applications_paymentId_invoiceId_key" ON "sales_applications"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_applications_creditDocumentId_invoiceId_key" ON "sales_applications"("creditDocumentId", "invoiceId");

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_depositAccountId_fkey" FOREIGN KEY ("depositAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_convertedFromId_fkey" FOREIGN KEY ("convertedFromId") REFERENCES "sales_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "sales_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_depositAccountId_fkey" FOREIGN KEY ("depositAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_applications" ADD CONSTRAINT "sales_applications_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "customer_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_applications" ADD CONSTRAINT "sales_applications_creditDocumentId_fkey" FOREIGN KEY ("creditDocumentId") REFERENCES "sales_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_applications" ADD CONSTRAINT "sales_applications_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written objects Prisma does not model: triggers, composite foreign
-- keys, partial indexes. Re-applied here so a fresh database gets them, and
-- idempotent so re-applying is free. Source of truth: prisma/sql/
-- ===========================================================================

-- source: prisma/sql/ledger-integrity.sql
-- ---------------------------------------------------------------------------
-- Ledger integrity rules R1-R7 and R10  (docs/02-accounting-design.md §2)
--
-- These are the actual guarantee. The posting engine enforces the same rules
-- first, because it can produce a decent error message -- but application-level
-- enforcement is not enforcement: a psql session, a migration script or a future
-- service will bypass it. Everything below holds regardless of how the write
-- arrives.
--
-- This file is the readable source. It is applied verbatim by a migration, and
-- `pnpm db:verify` asserts every object here still exists in the database.
-- ---------------------------------------------------------------------------


-- R1 -- A line is a debit or a credit. Never both, never negative, never zero.
--
-- `(debit = 0) <> (credit = 0)` is an exclusive-or: exactly one side must be
-- non-zero. A zero-zero line is rejected too; the posting engine drops those
-- before they reach here.
ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_one_sided;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_one_sided
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0));


-- R2/R3 -- Every posted journal balances and has at least two lines.
--
-- A plain CHECK cannot express this: it spans rows. An immediate trigger cannot
-- either, because it would fire on the first line, when the journal is by
-- definition unbalanced. A DEFERRABLE INITIALLY DEFERRED constraint trigger fires
-- once, at COMMIT -- so lines may be inserted one at a time, and an unbalanced
-- journal simply cannot exist outside an open transaction, from any client.
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS trigger AS $$
DECLARE
  v_journal_id text := COALESCE(NEW."journalId", OLD."journalId");
  v_status     text;
  v_number     text;
  v_debit      numeric(19,4);
  v_credit     numeric(19,4);
  v_lines      integer;
BEGIN
  SELECT status::text, "journalNumber" INTO v_status, v_number
    FROM journals WHERE id = v_journal_id;

  -- The journal was deleted in this same transaction (only possible for drafts).
  IF v_status IS NULL THEN
    RETURN NULL;
  END IF;

  -- Drafts are working copies and may be unbalanced. Nothing reads them as ledger.
  IF v_status = 'DRAFT' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
    INTO v_debit, v_credit, v_lines
    FROM journal_lines WHERE "journalId" = v_journal_id;

  IF v_lines < 2 THEN
    RAISE EXCEPTION
      'Journal % has % line(s). Double-entry requires at least two.', v_number, v_lines
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Journal % is out of balance: debits %, credits %, difference %.',
      v_number, v_debit, v_credit, (v_debit - v_credit)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_balanced ON journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();


-- R4 -- A posted journal is immutable.
--
-- The single permitted transition is POSTED -> REVERSED. Comparing the rest of
-- the row as jsonb catches every other field in one expression, including any
-- column added by a future migration -- an allow-list of column names would
-- silently stop protecting whatever is added next.
CREATE OR REPLACE FUNCTION forbid_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION
        'Journal % is posted and cannot be deleted. Post a reversal instead.', OLD."journalNumber"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION
      'Journal % has already been reversed and cannot be changed.', OLD."journalNumber"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'POSTED' THEN
    IF NEW.status = 'REVERSED'
       AND (to_jsonb(NEW) - 'status' - 'updatedAt') = (to_jsonb(OLD) - 'status' - 'updatedAt')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Journal % is posted and immutable. Post a reversal instead of editing it.', OLD."journalNumber"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_immutable ON journals;
CREATE TRIGGER trg_journal_immutable
  BEFORE UPDATE OR DELETE ON journals
  FOR EACH ROW EXECUTE FUNCTION forbid_posted_journal_mutation();


-- R4 (lines) -- Lines of a posted journal cannot be changed or removed.
CREATE OR REPLACE FUNCTION forbid_posted_line_mutation() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status::text INTO v_status
    FROM journals WHERE id = COALESCE(OLD."journalId", NEW."journalId");

  -- Journal already gone: a draft being deleted, cascading to its lines.
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'Journal lines cannot be changed once the journal is posted. Post a reversal instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_line_immutable ON journal_lines;
CREATE TRIGGER trg_journal_line_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_posted_line_mutation();


-- R5/R6 -- A journal posts into an open period, and its date falls inside it.
CREATE OR REPLACE FUNCTION assert_period_accepts_posting() RETURNS trigger AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM accounting_periods WHERE id = NEW."periodId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal % references an accounting period that does not exist.', NEW."journalNumber"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p."orgId" <> NEW."orgId" THEN
    RAISE EXCEPTION 'Journal % references another organisation''s accounting period.', NEW."journalNumber"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.date < p."startDate" OR NEW.date > p."endDate" THEN
    RAISE EXCEPTION
      'Journal date % falls outside its accounting period (% to %).',
      NEW.date, p."startDate", p."endDate"
      USING ERRCODE = 'check_violation';
  END IF;

  IF p.status <> 'OPEN' THEN
    RAISE EXCEPTION
      'The accounting period % to % is % and cannot accept postings.',
      p."startDate", p."endDate", lower(p.status::text)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_period_open ON journals;
CREATE TRIGGER trg_journal_period_open
  BEFORE INSERT ON journals
  FOR EACH ROW EXECUTE FUNCTION assert_period_accepts_posting();


-- R7 -- Control-account lines carry their subledger counterparty, and no line
-- posts to an inactive account or to a parent.
--
-- This trigger is also what keeps `journalDate` honest: rather than trusting the
-- caller's copy of the header date, it sets it. A denormalised column that can
-- drift is worse than no column at all.
CREATE OR REPLACE FUNCTION assert_line_dimensions() RETURNS trigger AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT "systemKey"::text AS system_key, "isActive", name, code
    INTO a
    FROM ledger_accounts
   WHERE id = NEW."accountId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal line references an account that does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT a."isActive" THEN
    RAISE EXCEPTION 'Account % (%) is archived and cannot receive postings.', a.code, a.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM ledger_accounts WHERE "parentId" = NEW."accountId") THEN
    RAISE EXCEPTION
      'Account % (%) has sub-accounts and is a grouping heading. Post to one of its sub-accounts.',
      a.code, a.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF a.system_key = 'ACCOUNTS_RECEIVABLE' AND NEW."customerId" IS NULL THEN
    RAISE EXCEPTION
      'A line posted to Accounts Receivable must name a customer, or the aging report and the control account will disagree.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF a.system_key = 'ACCOUNTS_PAYABLE' AND NEW."vendorId" IS NULL THEN
    RAISE EXCEPTION
      'A line posted to Accounts Payable must name a vendor, or the aging report and the control account will disagree.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW."journalDate" := (SELECT date FROM journals WHERE id = NEW."journalId");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_line_dimensions ON journal_lines;
CREATE TRIGGER trg_journal_line_dimensions
  BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION assert_line_dimensions();


-- R10 -- A system account cannot be deleted or have its systemKey reassigned.
--
-- Ordinary accounts are protected from deletion by the ON DELETE RESTRICT
-- foreign key from journal_lines; system accounts are protected unconditionally,
-- because the engine refers to them by name.
CREATE OR REPLACE FUNCTION protect_system_accounts() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isSystem" THEN
      RAISE EXCEPTION
        'Account % (%) is a system account and cannot be deleted. Rename it if the wording does not suit you.',
        OLD.code, OLD.name
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."systemKey" IS DISTINCT FROM NEW."systemKey" THEN
    RAISE EXCEPTION
      'The system role of account % (%) cannot be changed.', OLD.code, OLD.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."isSystem" AND NOT NEW."isActive" THEN
    RAISE EXCEPTION
      'Account % (%) is a system account and cannot be archived.', OLD.code, OLD.name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_system_accounts ON ledger_accounts;
CREATE TRIGGER trg_protect_system_accounts
  BEFORE UPDATE OR DELETE ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION protect_system_accounts();


-- An account's type and subtype must agree. A "BANK" account classified as
-- REVENUE would corrupt every financial statement it appears on.
CREATE OR REPLACE FUNCTION assert_account_classification() RETURNS trigger AS $$
DECLARE
  v_expected text;
BEGIN
  v_expected := CASE NEW.subtype::text
    WHEN 'BANK' THEN 'ASSET'
    WHEN 'ACCOUNTS_RECEIVABLE' THEN 'ASSET'
    WHEN 'UNDEPOSITED_FUNDS' THEN 'ASSET'
    WHEN 'INVENTORY' THEN 'ASSET'
    WHEN 'OTHER_CURRENT_ASSET' THEN 'ASSET'
    WHEN 'FIXED_ASSET' THEN 'ASSET'
    WHEN 'ACCUMULATED_DEPRECIATION' THEN 'ASSET'
    WHEN 'OTHER_ASSET' THEN 'ASSET'
    WHEN 'ACCOUNTS_PAYABLE' THEN 'LIABILITY'
    WHEN 'CREDIT_CARD' THEN 'LIABILITY'
    WHEN 'SALES_TAX_PAYABLE' THEN 'LIABILITY'
    WHEN 'OTHER_CURRENT_LIABILITY' THEN 'LIABILITY'
    WHEN 'LONG_TERM_LIABILITY' THEN 'LIABILITY'
    WHEN 'OWNERS_EQUITY' THEN 'EQUITY'
    WHEN 'RETAINED_EARNINGS' THEN 'EQUITY'
    WHEN 'OPENING_BALANCE_EQUITY' THEN 'EQUITY'
    WHEN 'DRAWINGS' THEN 'EQUITY'
    WHEN 'INCOME' THEN 'REVENUE'
    WHEN 'OTHER_INCOME' THEN 'REVENUE'
    WHEN 'SALES_DISCOUNTS' THEN 'REVENUE'
    WHEN 'COST_OF_GOODS_SOLD' THEN 'EXPENSE'
    WHEN 'OPERATING_EXPENSE' THEN 'EXPENSE'
    WHEN 'OTHER_EXPENSE' THEN 'EXPENSE'
    WHEN 'DEPRECIATION' THEN 'EXPENSE'
  END;

  IF v_expected IS NULL OR v_expected <> NEW.type::text THEN
    RAISE EXCEPTION
      'Account subtype % does not belong to type % (it belongs to %).',
      NEW.subtype, NEW.type, COALESCE(v_expected, 'no type')
      USING ERRCODE = 'check_violation';
  END IF;

  -- A sub-account must sit under a parent of the same statement type.
  IF NEW."parentId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ledger_accounts
       WHERE id = NEW."parentId" AND type = NEW.type AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION
        'A sub-account must sit under a parent of the same type in the same organisation.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."parentId" = NEW.id THEN
      RAISE EXCEPTION 'An account cannot be its own parent.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_classification ON ledger_accounts;
CREATE TRIGGER trg_account_classification
  BEFORE INSERT OR UPDATE ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION assert_account_classification();


-- R9 -- A line cannot reference another organisation's journal or account.
--
-- These sit alongside the ordinary single-column foreign keys Prisma manages.
-- Prisma does not model them: it would then treat `orgId` as a relation scalar
-- owned by two relations and refuse to let a nested create set it. The guarantee
-- belongs in the database regardless, and keeping it here leaves the client API
-- usable. Their targets are the (id, "orgId") unique indexes on journals and
-- ledger_accounts.
ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_journal_org_fkey;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_journal_org_fkey
  FOREIGN KEY ("journalId", "orgId") REFERENCES journals (id, "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_account_org_fkey;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_account_org_fkey
  FOREIGN KEY ("accountId", "orgId") REFERENCES ledger_accounts (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- source: prisma/sql/master-data-integrity.sql
-- ---------------------------------------------------------------------------
-- Master data integrity  (Phase 3)
--
-- Same principle as the ledger rules: the services check first because they can
-- explain themselves, and the database checks last because it is the guarantee.
-- Applied by a migration; re-asserted by `pnpm db:verify`.
-- ---------------------------------------------------------------------------


-- R9 (continued) -- Subledger dimensions cannot cross organisations.
--
-- Phase 2 created journal_lines."customerId" / "vendorId" without foreign keys,
-- because the tables did not exist yet. They do now. As with the journal and
-- account references, these carry "orgId" into the key so a line can never point
-- at another organisation's customer or vendor.
ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_customer_org_fkey;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_customer_org_fkey
  FOREIGN KEY ("customerId", "orgId") REFERENCES customers (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_vendor_org_fkey;
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_vendor_org_fkey
  FOREIGN KEY ("vendorId", "orgId") REFERENCES vendors (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- An item must map to the accounts its type actually needs, and each mapping must
-- point at an account of the right kind.
--
-- Posting is driven by these mappings. An inventory item with no COGS account
-- would sell at full margin; one whose "income" account is an expense would
-- invert the profit and loss. Neither should be expressible.
CREATE OR REPLACE FUNCTION assert_item_account_mapping() RETURNS trigger AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW."incomeAccountId" IS NOT NULL THEN
    SELECT type::text INTO v_type FROM ledger_accounts
      WHERE id = NEW."incomeAccountId" AND "orgId" = NEW."orgId";
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'The income account does not belong to this organisation.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_type <> 'REVENUE' THEN
      RAISE EXCEPTION 'An item''s income account must be an income account, not %.', lower(v_type)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."expenseAccountId" IS NOT NULL THEN
    SELECT type::text INTO v_type FROM ledger_accounts
      WHERE id = NEW."expenseAccountId" AND "orgId" = NEW."orgId";
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'The expense account does not belong to this organisation.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_type <> 'EXPENSE' THEN
      RAISE EXCEPTION 'An item''s expense account must be an expense account, not %.', lower(v_type)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."cogsAccountId" IS NOT NULL THEN
    SELECT type::text INTO v_type FROM ledger_accounts
      WHERE id = NEW."cogsAccountId" AND "orgId" = NEW."orgId";
    IF v_type IS DISTINCT FROM 'EXPENSE' THEN
      RAISE EXCEPTION 'The cost of goods sold account must be an expense account.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."inventoryAccountId" IS NOT NULL THEN
    SELECT subtype::text INTO v_type FROM ledger_accounts
      WHERE id = NEW."inventoryAccountId" AND "orgId" = NEW."orgId";
    IF v_type IS DISTINCT FROM 'INVENTORY' THEN
      RAISE EXCEPTION 'The inventory account must be an account of the inventory type.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A tracked item that cannot value its stock or its cost of sale is not a
  -- tracked item.
  IF NEW.type = 'INVENTORY' THEN
    IF NEW."incomeAccountId" IS NULL OR NEW."inventoryAccountId" IS NULL OR NEW."cogsAccountId" IS NULL THEN
      RAISE EXCEPTION
        'A tracked inventory item needs an income account, an inventory account and a cost of goods sold account.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_item_account_mapping ON items;
CREATE TRIGGER trg_item_account_mapping
  BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION assert_item_account_mapping();


-- A tax rate is a fraction between 0 and 1, not a percentage.
--
-- Storing 15 where 0.15 was meant is the single most likely tax bug there is, and
-- it produces invoices that are wrong by a factor of a hundred.
ALTER TABLE tax_rates
  DROP CONSTRAINT IF EXISTS tax_rates_fraction;
ALTER TABLE tax_rates
  ADD CONSTRAINT tax_rates_fraction
  CHECK (rate >= 0 AND rate <= 1);


-- Exactly one default payment term per organisation.
DROP INDEX IF EXISTS payment_terms_one_default;
CREATE UNIQUE INDEX payment_terms_one_default
  ON payment_terms ("orgId") WHERE "isDefault";


-- source: prisma/sql/sales-integrity.sql
-- ---------------------------------------------------------------------------
-- Sales integrity  (Phase 4)
--
-- Applied by a migration, re-applied by `pnpm db:harden`, re-asserted by
-- `pnpm db:verify`.
-- ---------------------------------------------------------------------------


-- R9 (continued) -- Sales documents and payments cannot cross organisations.
ALTER TABLE sales_document_lines
  DROP CONSTRAINT IF EXISTS sales_lines_document_org_fkey;
ALTER TABLE sales_document_lines
  ADD CONSTRAINT sales_lines_document_org_fkey
  FOREIGN KEY ("documentId", "orgId") REFERENCES sales_documents (id, "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE sales_applications
  DROP CONSTRAINT IF EXISTS sales_applications_invoice_org_fkey;
ALTER TABLE sales_applications
  ADD CONSTRAINT sales_applications_invoice_org_fkey
  FOREIGN KEY ("invoiceId", "orgId") REFERENCES sales_documents (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- An application has exactly one source: a payment, or a credit memo.
--
-- Without this, a row with neither would settle an invoice out of nothing, and a
-- row with both would be counted twice by whichever query looked first.
ALTER TABLE sales_applications
  DROP CONSTRAINT IF EXISTS sales_applications_one_source;
ALTER TABLE sales_applications
  ADD CONSTRAINT sales_applications_one_source
  CHECK (("paymentId" IS NULL) <> ("creditDocumentId" IS NULL));


-- An application is a positive amount.
ALTER TABLE sales_applications
  DROP CONSTRAINT IF EXISTS sales_applications_positive;
ALTER TABLE sales_applications
  ADD CONSTRAINT sales_applications_positive
  CHECK (amount > 0);


-- Nothing may be applied to a document that is not an invoice.
--
-- Applying a payment to an estimate or to another credit memo would settle
-- something that was never a receivable.
CREATE OR REPLACE FUNCTION assert_application_target() RETURNS trigger AS $$
DECLARE
  v_type   text;
  v_status text;
  v_total  numeric(19,4);
  v_applied numeric(19,4);
BEGIN
  SELECT type::text, status::text, total
    INTO v_type, v_status, v_total
    FROM sales_documents WHERE id = NEW."invoiceId";

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'The document being settled does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_type <> 'INVOICE' THEN
    RAISE EXCEPTION 'Only an invoice can be settled; this is a %.', lower(v_type)
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IN ('DRAFT', 'VOID') THEN
    RAISE EXCEPTION 'A % invoice cannot be settled.', lower(v_status)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Nothing may be over-applied. An invoice settled beyond its own total is a
  -- negative receivable, which is a credit note wearing a disguise.
  SELECT COALESCE(SUM(amount), 0) INTO v_applied
    FROM sales_applications
   WHERE "invoiceId" = NEW."invoiceId"
     AND id <> COALESCE(NEW.id, '');

  IF v_applied + NEW.amount > v_total + 0.0001 THEN
    RAISE EXCEPTION
      'That would settle % against an invoice of %, which already has % applied.',
      NEW.amount, v_total, v_applied
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_application_target ON sales_applications;
CREATE TRIGGER trg_application_target
  BEFORE INSERT OR UPDATE ON sales_applications
  FOR EACH ROW EXECUTE FUNCTION assert_application_target();


-- A document's stored totals must agree with its own lines.
--
-- Totals are stored because they are what the customer was shown. That makes it
-- worth proving they were never assembled wrongly: a document whose total does
-- not equal the sum of its lines would post a journal that disagrees with the
-- paper.
CREATE OR REPLACE FUNCTION assert_document_totals() RETURNS trigger AS $$
DECLARE
  v_lines_net numeric(19,4);
  v_lines_tax numeric(19,4);
  v_count     integer;
BEGIN
  IF NEW.status = 'DRAFT' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM("taxAmount"), 0), COUNT(*)
    INTO v_lines_net, v_lines_tax, v_count
    FROM sales_document_lines WHERE "documentId" = NEW.id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Document % has no lines.', NEW.number
      USING ERRCODE = 'check_violation';
  END IF;

  IF abs(v_lines_net - NEW.subtotal) > 0.0001 THEN
    RAISE EXCEPTION
      'Document % has a subtotal of % but its lines total %.', NEW.number, NEW.subtotal, v_lines_net
      USING ERRCODE = 'check_violation';
  END IF;

  IF abs(v_lines_tax - NEW."taxTotal") > 0.0001 THEN
    RAISE EXCEPTION
      'Document % has tax of % but its lines total %.', NEW.number, NEW."taxTotal", v_lines_tax
      USING ERRCODE = 'check_violation';
  END IF;

  IF abs((NEW.subtotal - NEW."discountAmount" + NEW."taxTotal") - NEW.total) > 0.0001 THEN
    RAISE EXCEPTION
      'Document % does not add up: % subtotal less % discount plus % tax is not %.',
      NEW.number, NEW.subtotal, NEW."discountAmount", NEW."taxTotal", NEW.total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_totals ON sales_documents;
CREATE CONSTRAINT TRIGGER trg_document_totals
  AFTER INSERT OR UPDATE ON sales_documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_document_totals();


-- Documents that move cash immediately must say where it went.
ALTER TABLE sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_deposit_required;
ALTER TABLE sales_documents
  ADD CONSTRAINT sales_documents_deposit_required
  CHECK (
    type NOT IN ('SALES_RECEIPT', 'REFUND_RECEIPT')
    OR status = 'DRAFT'
    OR "depositAccountId" IS NOT NULL
  );


-- Totals are never negative. A negative invoice is a credit memo.
ALTER TABLE sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_non_negative;
ALTER TABLE sales_documents
  ADD CONSTRAINT sales_documents_non_negative
  CHECK (total >= 0 AND subtotal >= 0 AND "taxTotal" >= 0 AND "discountAmount" >= 0);


-- A payment is a positive amount.
ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_positive;
ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_positive
  CHECK (amount > 0);


-- A payment or credit cannot be applied beyond its own value.
CREATE OR REPLACE FUNCTION assert_application_source() RETURNS trigger AS $$
DECLARE
  v_available numeric(19,4);
  v_applied   numeric(19,4);
  v_label     text;
BEGIN
  IF NEW."paymentId" IS NOT NULL THEN
    SELECT amount, 'Payment ' || number INTO v_available, v_label
      FROM customer_payments WHERE id = NEW."paymentId";
    SELECT COALESCE(SUM(amount), 0) INTO v_applied
      FROM sales_applications
     WHERE "paymentId" = NEW."paymentId" AND id <> COALESCE(NEW.id, '');
  ELSE
    SELECT total, 'Credit memo ' || number INTO v_available, v_label
      FROM sales_documents WHERE id = NEW."creditDocumentId";
    SELECT COALESCE(SUM(amount), 0) INTO v_applied
      FROM sales_applications
     WHERE "creditDocumentId" = NEW."creditDocumentId" AND id <> COALESCE(NEW.id, '');
  END IF;

  IF v_available IS NULL THEN
    RAISE EXCEPTION 'The payment or credit being applied does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_applied + NEW.amount > v_available + 0.0001 THEN
    RAISE EXCEPTION
      '% is worth % and already has % applied; % more cannot come out of it.',
      v_label, v_available, v_applied, NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_application_source ON sales_applications;
CREATE TRIGGER trg_application_source
  BEFORE INSERT OR UPDATE ON sales_applications
  FOR EACH ROW EXECUTE FUNCTION assert_application_source();

