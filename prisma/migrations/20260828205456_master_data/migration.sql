-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_customer_org_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_vendor_org_fkey";

-- ---------------------------------------------------------------------------
-- Prisma's diff dropped the tenancy-carrying composite foreign keys above: it
-- does not model them, so it reads them as drift. They are re-applied here.
--
-- This will happen again on any future `prisma migrate dev`, which is why
-- `pnpm db:migrate` and `pnpm db:deploy` now re-apply prisma/sql/*.sql
-- afterwards, and `pnpm db:verify` fails loudly if any of them is missing.
-- ---------------------------------------------------------------------------
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_customer_org_fkey
  FOREIGN KEY ("customerId", "orgId") REFERENCES customers (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_vendor_org_fkey
  FOREIGN KEY ("vendorId", "orgId") REFERENCES vendors (id, "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
