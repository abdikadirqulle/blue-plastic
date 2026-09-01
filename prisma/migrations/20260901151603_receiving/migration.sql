-- DropIndex
DROP INDEX "purchase_documents_convertedFromId_key";

-- AlterTable
ALTER TABLE "purchase_document_lines" ADD COLUMN     "quantityReceived" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "purchase_documents_convertedFromId_idx" ON "purchase_documents"("convertedFromId");

-- Backfill: an order that was already converted was converted in full.
--
-- Before this migration the only way to receive an order was to turn the whole
-- thing into a bill at once, which closed it. Those orders have nothing left
-- outstanding, so their lines are marked fully received — otherwise every closed
-- order in the books would read as if none of it had ever arrived.
UPDATE purchase_document_lines l
   SET "quantityReceived" = l.quantity
  FROM purchase_documents d
 WHERE d.id = l."documentId"
   AND d.type = 'PURCHASE_ORDER'
   AND d.status = 'CLOSED';

-- ===========================================================================
-- Hand-written objects Prisma does not model: triggers, composite foreign
-- keys, partial indexes. Re-applied here so a fresh database gets them, and
-- idempotent so re-applying is free. Source of truth: prisma/sql/
-- ===========================================================================

-- source: prisma/sql/banking-integrity.sql
-- ---------------------------------------------------------------------------
-- Banking integrity  (Phase 6)
-- ---------------------------------------------------------------------------


-- R9 -- Banking documents cannot cross organisations.
ALTER TABLE deposit_lines DROP CONSTRAINT IF EXISTS deposit_lines_deposit_org_fkey;
ALTER TABLE deposit_lines
  ADD CONSTRAINT deposit_lines_deposit_org_fkey
  FOREIGN KEY ("depositId", "orgId") REFERENCES deposits (id, "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;


-- A transfer moves money between two *different* accounts.
--
-- A transfer to itself posts a debit and a credit to the same account. It nets to
-- nothing, balances perfectly, and is invisible on every report — which is
-- exactly why it should be impossible rather than merely discouraged.
ALTER TABLE bank_transfers DROP CONSTRAINT IF EXISTS bank_transfers_distinct_accounts;
ALTER TABLE bank_transfers
  ADD CONSTRAINT bank_transfers_distinct_accounts
  CHECK ("fromAccountId" <> "toAccountId");

ALTER TABLE bank_transfers DROP CONSTRAINT IF EXISTS bank_transfers_positive;
ALTER TABLE bank_transfers
  ADD CONSTRAINT bank_transfers_positive
  CHECK (amount > 0);


-- A deposit line is either a customer payment being banked, or money from
-- somewhere else. Never both, never neither.
ALTER TABLE deposit_lines DROP CONSTRAINT IF EXISTS deposit_lines_one_source;
ALTER TABLE deposit_lines
  ADD CONSTRAINT deposit_lines_one_source
  CHECK (("customerPaymentId" IS NULL) <> ("accountId" IS NULL));

ALTER TABLE deposit_lines DROP CONSTRAINT IF EXISTS deposit_lines_positive;
ALTER TABLE deposit_lines
  ADD CONSTRAINT deposit_lines_positive
  CHECK (amount > 0);


-- A posted deposit's total agrees with its own lines.
CREATE OR REPLACE FUNCTION assert_deposit_total() RETURNS trigger AS $$
DECLARE
  v_lines numeric(19,4);
  v_count integer;
BEGIN
  IF NEW.status = 'VOID' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_lines, v_count
    FROM deposit_lines WHERE "depositId" = NEW.id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Deposit % has no lines.', NEW.number USING ERRCODE = 'check_violation';
  END IF;

  IF abs(v_lines - NEW.total) > 0.0001 THEN
    RAISE EXCEPTION 'Deposit % totals % but its lines add up to %.', NEW.number, NEW.total, v_lines
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deposit_total ON deposits;
CREATE CONSTRAINT TRIGGER trg_deposit_total
  AFTER INSERT OR UPDATE ON deposits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_deposit_total();


-- A completed reconciliation is immutable, and so are its entries.
--
-- The same principle as the ledger itself: last month's reconciliation is a
-- statement about the past. Undoing one is a deliberate act that deletes it
-- outright and says so in the audit log, not an edit that quietly changes what it
-- used to say.
CREATE OR REPLACE FUNCTION forbid_completed_reconciliation_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Deleting a completed reconciliation is how "undo" works, and is allowed.
    RETURN OLD;
  END IF;

  IF OLD.status = 'COMPLETED' AND NEW.status = 'COMPLETED' THEN
    IF (to_jsonb(NEW) - 'notes') <> (to_jsonb(OLD) - 'notes') THEN
      RAISE EXCEPTION
        'Reconciliation of % is complete and cannot be changed. Undo it instead.', OLD."statementDate"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_immutable ON bank_reconciliations;
CREATE TRIGGER trg_reconciliation_immutable
  BEFORE UPDATE OR DELETE ON bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION forbid_completed_reconciliation_change();


-- Nothing may be added to or removed from a completed reconciliation.
CREATE OR REPLACE FUNCTION forbid_completed_entry_change() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status::text INTO v_status
    FROM bank_reconciliations
   WHERE id = COALESCE(NEW."reconciliationId", OLD."reconciliationId");

  -- The reconciliation is being deleted in this same transaction (an undo).
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status = 'COMPLETED' THEN
    RAISE EXCEPTION
      'That reconciliation is complete. Undo it before changing which items are cleared.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_entry_locked ON reconciliation_entries;
CREATE TRIGGER trg_reconciliation_entry_locked
  BEFORE INSERT OR UPDATE OR DELETE ON reconciliation_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_completed_entry_change();


-- A reconciliation entry names a line on the account being reconciled.
--
-- Clearing a line from a different account would let a reconciliation "balance"
-- against money that was never in that account.
CREATE OR REPLACE FUNCTION assert_entry_account_matches() RETURNS trigger AS $$
DECLARE
  v_recon_account text;
  v_line_account  text;
BEGIN
  SELECT "accountId" INTO v_recon_account
    FROM bank_reconciliations WHERE id = NEW."reconciliationId";
  SELECT "accountId" INTO v_line_account
    FROM journal_lines WHERE id = NEW."journalLineId";

  IF v_recon_account IS DISTINCT FROM v_line_account THEN
    RAISE EXCEPTION
      'That entry is on a different account from the one being reconciled.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entry_account_matches ON reconciliation_entries;
CREATE TRIGGER trg_entry_account_matches
  BEFORE INSERT OR UPDATE ON reconciliation_entries
  FOR EACH ROW EXECUTE FUNCTION assert_entry_account_matches();


-- One reconciliation in progress per account at a time.
DROP INDEX IF EXISTS reconciliations_one_in_progress;
CREATE UNIQUE INDEX reconciliations_one_in_progress
  ON bank_reconciliations ("accountId") WHERE status = 'IN_PROGRESS';


-- source: prisma/sql/inventory-integrity.sql
-- ---------------------------------------------------------------------------
-- Inventory integrity  (Phase 7)
-- ---------------------------------------------------------------------------


-- R9 -- Adjustment lines cannot cross organisations.
ALTER TABLE inventory_adjustment_lines DROP CONSTRAINT IF EXISTS adjustment_lines_document_org_fkey;
ALTER TABLE inventory_adjustment_lines
  ADD CONSTRAINT adjustment_lines_document_org_fkey
  FOREIGN KEY ("adjustmentId", "orgId") REFERENCES inventory_adjustments (id, "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;


-- A movement of nothing is not a movement.
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_non_zero;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_non_zero
  CHECK (quantity <> 0 OR value <> 0);


-- The stock ledger is append-only, exactly like the general ledger.
--
-- Its running totals are the reason. Each row states the item's position after
-- that movement; editing an earlier row would make every later one a lie, and
-- silently break the equality with the Inventory Asset account that the whole
-- design rests on. Corrections are adjustments, which are themselves movements.
CREATE OR REPLACE FUNCTION forbid_inventory_movement_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Stock movements cannot be deleted. Record an adjustment instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One transition is permitted: attaching the movement to the journal it was
  -- posted with. The cost has to be known before the journal can be built, so
  -- the movement is necessarily written first; recording which entry carried it
  -- is not a change to the movement. Everything else about the row must be
  -- identical, and a journal that is already set cannot be swapped.
  IF OLD."journalId" IS NULL AND NEW."journalId" IS NOT NULL
     AND (to_jsonb(NEW) - 'journalId') = (to_jsonb(OLD) - 'journalId')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Stock movements cannot be changed. Record an adjustment instead.'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_movement_immutable ON inventory_transactions;
CREATE TRIGGER trg_inventory_movement_immutable
  BEFORE UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_inventory_movement_change();


-- Only a tracked item has a stock ledger.
--
-- A service has no quantity and no cost to carry; a movement against one would
-- put value into the Inventory Asset account that no stock corresponds to.
CREATE OR REPLACE FUNCTION assert_movement_item_tracked() RETURNS trigger AS $$
DECLARE
  v_type text;
  v_name text;
BEGIN
  SELECT type::text, name INTO v_type, v_name FROM items WHERE id = NEW."itemId";

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Stock movement references an item that does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_type <> 'INVENTORY' THEN
    RAISE EXCEPTION
      '"%" is not a tracked inventory item, so it has no stock to move.', v_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movement_item_tracked ON inventory_transactions;
CREATE TRIGGER trg_movement_item_tracked
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION assert_movement_item_tracked();


-- The running totals must follow on from the movement before them.
--
-- This is what makes the ledger's own arithmetic checkable rather than merely
-- intended: each row is verified against its predecessor at the moment it is
-- written, so a bug in the costing engine cannot quietly accumulate.
CREATE OR REPLACE FUNCTION assert_movement_continuity() RETURNS trigger AS $$
DECLARE
  prev RECORD;
  expected_quantity numeric(19,4);
  expected_value    numeric(19,4);
BEGIN
  SELECT "runningQuantity", "runningValue", sequence
    INTO prev
    FROM inventory_transactions
   WHERE "itemId" = NEW."itemId"
   ORDER BY sequence DESC
   LIMIT 1;

  IF NOT FOUND THEN
    expected_quantity := NEW.quantity;
    expected_value    := NEW.value;
    IF NEW.sequence <> 1 THEN
      RAISE EXCEPTION 'The first movement for an item must be sequence 1, not %.', NEW.sequence
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.sequence <> prev.sequence + 1 THEN
      RAISE EXCEPTION
        'Stock movements must be consecutive: expected sequence %, got %.',
        prev.sequence + 1, NEW.sequence
        USING ERRCODE = 'check_violation';
    END IF;
    expected_quantity := prev."runningQuantity" + NEW.quantity;
    expected_value    := prev."runningValue" + NEW.value;
  END IF;

  IF abs(NEW."runningQuantity" - expected_quantity) > 0.0001 THEN
    RAISE EXCEPTION
      'Running quantity is % but the movement before it leaves %.',
      NEW."runningQuantity", expected_quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF abs(NEW."runningValue" - expected_value) > 0.0001 THEN
    RAISE EXCEPTION
      'Running value is % but the movement before it leaves %.',
      NEW."runningValue", expected_value
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movement_continuity ON inventory_transactions;
CREATE TRIGGER trg_movement_continuity
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION assert_movement_continuity();


-- An adjustment line's arithmetic must hold.
ALTER TABLE inventory_adjustment_lines DROP CONSTRAINT IF EXISTS adjustment_lines_change;
ALTER TABLE inventory_adjustment_lines
  ADD CONSTRAINT adjustment_lines_change
  CHECK (abs("quantityChange" - ("countedQuantity" - "previousQuantity")) < 0.0001);


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


-- source: prisma/sql/period-integrity.sql
-- ---------------------------------------------------------------------------
-- Period close and year-end integrity  (Phase 9)
--
-- R5/R6 already stop a posting entering a closed period; those live in
-- ledger-integrity.sql. What follows protects the *close itself*: the record of
-- which journal closed which year, and the consistency of a year's own state.
-- ---------------------------------------------------------------------------


-- R9 -- A year's closing journal belongs to the same organisation.
--
-- Without this the closingJournalId is an ordinary foreign key that would happily
-- point at another tenant's journal, and reopening the year would reverse it.
ALTER TABLE fiscal_years DROP CONSTRAINT IF EXISTS fiscal_years_closing_journal_org_fkey;
ALTER TABLE fiscal_years
  ADD CONSTRAINT fiscal_years_closing_journal_org_fkey
  FOREIGN KEY ("closingJournalId", "orgId") REFERENCES journals (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- A journal that says it is a closing entry is sourced as one, or reverses one.
--
-- The flag and the source type are two records of the same fact, and the reports
-- read one while the year-end reads the other. Letting them disagree would mean
-- a closing entry invisible to the adjusting-entries report, or an ordinary
-- journal counted as a year-end.
--
-- REVERSAL is allowed because reopening a year reverses its closing entry, and
-- that reversal has to carry the flag: the profit and loss leaves closing entries
-- out, and if it left out the sweep but counted the sweep coming back, a reopened
-- year would report double its income.
ALTER TABLE journals DROP CONSTRAINT IF EXISTS journals_closing_entry_source;
ALTER TABLE journals
  ADD CONSTRAINT journals_closing_entry_source
  CHECK ("isClosingEntry" = false OR "sourceType" IN ('CLOSING_ENTRY', 'REVERSAL'));


-- An open year carries no record of having been closed.
--
-- Reopening clears the closing journal and the timestamp together. If either
-- could survive, a second close would either be refused for a year that is open
-- or would orphan the first closing entry.
ALTER TABLE fiscal_years DROP CONSTRAINT IF EXISTS fiscal_years_close_record;
ALTER TABLE fiscal_years
  ADD CONSTRAINT fiscal_years_close_record
  CHECK (
    (status = 'LOCKED' AND "closedAt" IS NOT NULL)
    OR (status <> 'LOCKED' AND "closedAt" IS NULL AND "closingJournalId" IS NULL)
  );


-- A locked year has no period still accepting postings.
--
-- The year-end locks every period in the same transaction as the closing entry.
-- This refuses the state where that half-happened — a locked year with an open
-- month is an invitation to post into a year whose profit has already been swept
-- to Retained Earnings, and no report would show the discrepancy.
CREATE OR REPLACE FUNCTION assert_locked_year_has_no_open_period() RETURNS trigger AS $$
DECLARE
  v_open    integer;
  v_year_id text;
BEGIN
  -- One function, two tables. Read the year id through jsonb rather than by
  -- field name, because a period names its year and a year names itself.
  IF TG_TABLE_NAME = 'fiscal_years' THEN
    v_year_id := to_jsonb(NEW) ->> 'id';
  ELSE
    v_year_id := to_jsonb(NEW) ->> 'fiscalYearId';
  END IF;

  SELECT COUNT(*) INTO v_open
    FROM accounting_periods p
    JOIN fiscal_years y ON y.id = p."fiscalYearId"
   WHERE y.status = 'LOCKED'
     AND p.status <> 'LOCKED'
     AND y.id = v_year_id;

  IF v_open > 0 THEN
    RAISE EXCEPTION
      'A closed fiscal year cannot contain a period that still accepts postings.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locked_year_periods ON accounting_periods;
CREATE CONSTRAINT TRIGGER trg_locked_year_periods
  AFTER INSERT OR UPDATE ON accounting_periods
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_locked_year_has_no_open_period();

DROP TRIGGER IF EXISTS trg_locked_year_self ON fiscal_years;
CREATE CONSTRAINT TRIGGER trg_locked_year_self
  AFTER INSERT OR UPDATE ON fiscal_years
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_locked_year_has_no_open_period();


-- source: prisma/sql/purchase-integrity.sql
-- ---------------------------------------------------------------------------
-- Purchase integrity  (Phase 5)
--
-- The mirror of prisma/sql/sales-integrity.sql. Deliberately the same rules with
-- the same wording: two subledgers that behave differently is a source of bugs
-- and of arguments.
-- ---------------------------------------------------------------------------


-- R9 -- Purchase documents and payments cannot cross organisations.
ALTER TABLE purchase_document_lines
  DROP CONSTRAINT IF EXISTS purchase_lines_document_org_fkey;
ALTER TABLE purchase_document_lines
  ADD CONSTRAINT purchase_lines_document_org_fkey
  FOREIGN KEY ("documentId", "orgId") REFERENCES purchase_documents (id, "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE purchase_applications
  DROP CONSTRAINT IF EXISTS purchase_applications_bill_org_fkey;
ALTER TABLE purchase_applications
  ADD CONSTRAINT purchase_applications_bill_org_fkey
  FOREIGN KEY ("billId", "orgId") REFERENCES purchase_documents (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- An application has exactly one source: a payment, or a vendor credit.
ALTER TABLE purchase_applications
  DROP CONSTRAINT IF EXISTS purchase_applications_one_source;
ALTER TABLE purchase_applications
  ADD CONSTRAINT purchase_applications_one_source
  CHECK (("paymentId" IS NULL) <> ("creditDocumentId" IS NULL));

ALTER TABLE purchase_applications
  DROP CONSTRAINT IF EXISTS purchase_applications_positive;
ALTER TABLE purchase_applications
  ADD CONSTRAINT purchase_applications_positive
  CHECK (amount > 0);


-- Only an open bill can be settled, and never beyond its total.
CREATE OR REPLACE FUNCTION assert_purchase_application_target() RETURNS trigger AS $$
DECLARE
  v_type    text;
  v_status  text;
  v_total   numeric(19,4);
  v_applied numeric(19,4);
BEGIN
  SELECT type::text, status::text, total
    INTO v_type, v_status, v_total
    FROM purchase_documents WHERE id = NEW."billId";

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'The document being settled does not exist.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_type <> 'BILL' THEN
    RAISE EXCEPTION 'Only a bill can be settled; this is a %.', lower(replace(v_type, '_', ' '))
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status IN ('DRAFT', 'VOID') THEN
    RAISE EXCEPTION 'A % bill cannot be settled.', lower(v_status)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_applied
    FROM purchase_applications
   WHERE "billId" = NEW."billId" AND id <> COALESCE(NEW.id, '');

  IF v_applied + NEW.amount > v_total + 0.0001 THEN
    RAISE EXCEPTION
      'That would settle % against a bill of %, which already has % applied.',
      NEW.amount, v_total, v_applied
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_application_target ON purchase_applications;
CREATE TRIGGER trg_purchase_application_target
  BEFORE INSERT OR UPDATE ON purchase_applications
  FOR EACH ROW EXECUTE FUNCTION assert_purchase_application_target();


-- A payment or credit cannot be applied beyond its own value.
CREATE OR REPLACE FUNCTION assert_purchase_application_source() RETURNS trigger AS $$
DECLARE
  v_available numeric(19,4);
  v_applied   numeric(19,4);
  v_label     text;
BEGIN
  IF NEW."paymentId" IS NOT NULL THEN
    SELECT amount, 'Payment ' || number INTO v_available, v_label
      FROM bill_payments WHERE id = NEW."paymentId";
    SELECT COALESCE(SUM(amount), 0) INTO v_applied
      FROM purchase_applications
     WHERE "paymentId" = NEW."paymentId" AND id <> COALESCE(NEW.id, '');
  ELSE
    SELECT total, 'Vendor credit ' || number INTO v_available, v_label
      FROM purchase_documents WHERE id = NEW."creditDocumentId";
    SELECT COALESCE(SUM(amount), 0) INTO v_applied
      FROM purchase_applications
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

DROP TRIGGER IF EXISTS trg_purchase_application_source ON purchase_applications;
CREATE TRIGGER trg_purchase_application_source
  BEFORE INSERT OR UPDATE ON purchase_applications
  FOR EACH ROW EXECUTE FUNCTION assert_purchase_application_source();


-- A posted document's totals agree with its own lines.
CREATE OR REPLACE FUNCTION assert_purchase_totals() RETURNS trigger AS $$
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
    FROM purchase_document_lines WHERE "documentId" = NEW.id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Document % has no lines.', NEW.number USING ERRCODE = 'check_violation';
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

  IF abs((NEW.subtotal + NEW."taxTotal") - NEW.total) > 0.0001 THEN
    RAISE EXCEPTION
      'Document % does not add up: % plus % tax is not %.',
      NEW.number, NEW.subtotal, NEW."taxTotal", NEW.total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_totals ON purchase_documents;
CREATE CONSTRAINT TRIGGER trg_purchase_totals
  AFTER INSERT OR UPDATE ON purchase_documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_purchase_totals();


-- An expense is paid at once, so it must say what it was paid from.
ALTER TABLE purchase_documents
  DROP CONSTRAINT IF EXISTS purchase_documents_payment_required;
ALTER TABLE purchase_documents
  ADD CONSTRAINT purchase_documents_payment_required
  CHECK (type <> 'EXPENSE' OR status = 'DRAFT' OR "paymentAccountId" IS NOT NULL);


-- Totals are never negative. A negative bill is a vendor credit.
ALTER TABLE purchase_documents
  DROP CONSTRAINT IF EXISTS purchase_documents_non_negative;
ALTER TABLE purchase_documents
  ADD CONSTRAINT purchase_documents_non_negative
  CHECK (total >= 0 AND subtotal >= 0 AND "taxTotal" >= 0);

ALTER TABLE bill_payments
  DROP CONSTRAINT IF EXISTS bill_payments_positive;
ALTER TABLE bill_payments
  ADD CONSTRAINT bill_payments_positive
  CHECK (amount > 0);


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

