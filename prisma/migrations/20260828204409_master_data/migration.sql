-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('SERVICE', 'NON_INVENTORY', 'INVENTORY');

-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('DUE_ON_RECEIPT', 'NET_DAYS', 'DAY_OF_MONTH');

-- CreateEnum
CREATE TYPE "TaxApplication" AS ENUM ('SALES', 'PURCHASES', 'BOTH');

-- CreateEnum
CREATE TYPE "TaxFilingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_account_org_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_journal_org_fkey";

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentTermType" NOT NULL DEFAULT 'NET_DAYS',
    "dueDays" SMALLINT NOT NULL DEFAULT 30,
    "discountDays" SMALLINT,
    "discountPercent" DECIMAL(9,4),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "taxRegistrationNumber" TEXT,
    "billingLine1" TEXT,
    "billingLine2" TEXT,
    "billingCity" TEXT,
    "billingRegion" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" CHAR(2),
    "shippingLine1" TEXT,
    "shippingLine2" TEXT,
    "shippingCity" TEXT,
    "shippingRegion" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCountry" CHAR(2),
    "paymentTermId" TEXT,
    "creditLimit" DECIMAL(19,4),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "taxRegistrationNumber" TEXT,
    "billingLine1" TEXT,
    "billingLine2" TEXT,
    "billingCity" TEXT,
    "billingRegion" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" CHAR(2),
    "paymentTermId" TEXT,
    "defaultExpenseAccountId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ItemType" NOT NULL DEFAULT 'NON_INVENTORY',
    "categoryId" TEXT,
    "unitOfMeasure" TEXT,
    "salesDescription" TEXT,
    "salesPrice" DECIMAL(19,4),
    "incomeAccountId" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "salesTaxCodeId" TEXT,
    "purchaseDescription" TEXT,
    "purchaseCost" DECIMAL(19,4),
    "expenseAccountId" TEXT,
    "purchaseTaxCodeId" TEXT,
    "inventoryAccountId" TEXT,
    "cogsAccountId" TEXT,
    "reorderPoint" DECIMAL(19,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_agencies" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "filingFrequency" "TaxFilingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(19,9) NOT NULL,
    "agencyId" TEXT NOT NULL,
    "appliesTo" "TaxApplication" NOT NULL DEFAULT 'BOTH',
    "salesAccountId" TEXT,
    "purchaseAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_codes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_code_rates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "sequence" SMALLINT NOT NULL DEFAULT 1,
    "isCompound" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tax_code_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_terms_orgId_isActive_idx" ON "payment_terms"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_orgId_name_key" ON "payment_terms"("orgId", "name");

-- CreateIndex
CREATE INDEX "customers_orgId_isActive_displayName_idx" ON "customers"("orgId", "isActive", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "customers_orgId_displayName_key" ON "customers"("orgId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_orgId_key" ON "customers"("id", "orgId");

-- CreateIndex
CREATE INDEX "vendors_orgId_isActive_displayName_idx" ON "vendors"("orgId", "isActive", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_orgId_displayName_key" ON "vendors"("orgId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_id_orgId_key" ON "vendors"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_orgId_name_key" ON "item_categories"("orgId", "name");

-- CreateIndex
CREATE INDEX "items_orgId_isActive_name_idx" ON "items"("orgId", "isActive", "name");

-- CreateIndex
CREATE INDEX "items_orgId_type_idx" ON "items"("orgId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "items_orgId_name_key" ON "items"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "items_orgId_sku_key" ON "items"("orgId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "tax_agencies_orgId_name_key" ON "tax_agencies"("orgId", "name");

-- CreateIndex
CREATE INDEX "tax_rates_orgId_isActive_idx" ON "tax_rates"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_orgId_name_key" ON "tax_rates"("orgId", "name");

-- CreateIndex
CREATE INDEX "tax_codes_orgId_isActive_idx" ON "tax_codes"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tax_codes_orgId_name_key" ON "tax_codes"("orgId", "name");

-- CreateIndex
CREATE INDEX "tax_code_rates_taxCodeId_sequence_idx" ON "tax_code_rates"("taxCodeId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "tax_code_rates_taxCodeId_taxRateId_key" ON "tax_code_rates"("taxCodeId", "taxRateId");

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_defaultExpenseAccountId_fkey" FOREIGN KEY ("defaultExpenseAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_cogsAccountId_fkey" FOREIGN KEY ("cogsAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_salesTaxCodeId_fkey" FOREIGN KEY ("salesTaxCodeId") REFERENCES "tax_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_purchaseTaxCodeId_fkey" FOREIGN KEY ("purchaseTaxCodeId") REFERENCES "tax_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_agencies" ADD CONSTRAINT "tax_agencies_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "tax_agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_salesAccountId_fkey" FOREIGN KEY ("salesAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_code_rates" ADD CONSTRAINT "tax_code_rates_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "tax_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_code_rates" ADD CONSTRAINT "tax_code_rates_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Master data integrity. Source: prisma/sql/master-data-integrity.sql
-- ===========================================================================

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
