-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_accountId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_journalId_orgId_fkey";

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- R9 -- Tenancy-carrying composite foreign keys, re-added alongside Prisma's
-- single-column ones. Source: prisma/sql/ledger-integrity.sql
-- ---------------------------------------------------------------------------
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
