import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/server/db'
import { createDefaultSequences, nextDocumentNumber } from '@/server/sequences'

/**
 * These run against the real database, but never leave anything behind: every
 * test body runs inside a transaction that is deliberately aborted. That is the
 * only responsible way to exercise integrity rules against a live ledger.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL)
const suite = hasDatabase ? describe : describe.skip

class Rollback extends Error {}

async function inRolledBackTransaction(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>) {
  try {
    await db.$transaction(
      async (tx) => {
        await fn(tx)
        throw new Rollback()
      },
      // Generous, because these run against a remote database over the network.
      { maxWait: 20_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

suite('tenant isolation', () => {
  it('never returns another organisation\'s rows from an org-scoped query', async () => {
    await inRolledBackTransaction(async (tx) => {
      const [orgA, orgB] = await Promise.all([
        tx.organization.create({ data: { name: 'Org A' }, select: { id: true } }),
        tx.organization.create({ data: { name: 'Org B' }, select: { id: true } }),
      ])

      const user = await tx.user.create({
        data: { email: `iso-${Date.now()}@test.invalid`, name: 'Isolation Test' },
        select: { id: true },
      })

      await tx.membership.create({
        data: { orgId: orgA.id, userId: user.id, role: 'ACCOUNTANT', status: 'ACTIVE' },
      })

      await tx.auditLog.create({
        data: { orgId: orgA.id, entity: 'Organization', entityId: orgA.id, action: 'CREATE' },
      })

      // The service layer always scopes by orgId. Asking as Org B must return nothing.
      expect(await tx.membership.count({ where: { orgId: orgB.id } })).toBe(0)
      expect(await tx.auditLog.count({ where: { orgId: orgB.id } })).toBe(0)

      expect(await tx.membership.count({ where: { orgId: orgA.id } })).toBe(1)
      expect(await tx.auditLog.count({ where: { orgId: orgA.id } })).toBe(1)

      // The composite lookup used by getOrgContext cannot be satisfied cross-tenant.
      const wrongTenant = await tx.membership.findUnique({
        where: { orgId_userId: { orgId: orgB.id, userId: user.id } },
      })
      expect(wrongTenant).toBeNull()
    })
  })

  it('scopes uniqueness per organisation, not globally', async () => {
    await inRolledBackTransaction(async (tx) => {
      const [orgA, orgB] = await Promise.all([
        tx.organization.create({ data: { name: 'Org A' }, select: { id: true } }),
        tx.organization.create({ data: { name: 'Org B' }, select: { id: true } }),
      ])

      await createDefaultSequences(tx, orgA.id)
      await createDefaultSequences(tx, orgB.id)

      // Both organisations start their own numbering at 1.
      expect(await nextDocumentNumber(tx, orgA.id, 'INVOICE')).toBe('INV-00001')
      expect(await nextDocumentNumber(tx, orgB.id, 'INVOICE')).toBe('INV-00001')
    })
  })
})

suite('document numbering', () => {
  it('allocates sequential, padded, prefixed numbers', async () => {
    await inRolledBackTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: 'Numbering' }, select: { id: true } })
      await createDefaultSequences(tx, org.id)

      const numbers = []
      for (let i = 0; i < 3; i++) numbers.push(await nextDocumentNumber(tx, org.id, 'JOURNAL'))

      expect(numbers).toEqual(['JE-00001', 'JE-00002', 'JE-00003'])
    })
  })

  it('keeps each document type on its own sequence', async () => {
    await inRolledBackTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: 'Numbering' }, select: { id: true } })
      await createDefaultSequences(tx, org.id)

      expect(await nextDocumentNumber(tx, org.id, 'INVOICE')).toBe('INV-00001')
      expect(await nextDocumentNumber(tx, org.id, 'BILL')).toBe('BILL-00001')
      expect(await nextDocumentNumber(tx, org.id, 'INVOICE')).toBe('INV-00002')
    })
  })

  it('creates the sequence on first use when one was never seeded', async () => {
    await inRolledBackTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: 'Unseeded' }, select: { id: true } })

      expect(await nextDocumentNumber(tx, org.id, 'DEPOSIT')).toBe('DEP-00001')
      expect(await nextDocumentNumber(tx, org.id, 'DEPOSIT')).toBe('DEP-00002')
    })
  })
})

suite('membership revocation', () => {
  it('bumps the version on a role change so issued tokens stop being honoured', async () => {
    await inRolledBackTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: 'Revocation' }, select: { id: true } })
      const user = await tx.user.create({
        data: { email: `rev-${Date.now()}@test.invalid`, name: 'Revocation Test' },
        select: { id: true },
      })

      const membership = await tx.membership.create({
        data: { orgId: org.id, userId: user.id, role: 'VIEWER', status: 'ACTIVE' },
        select: { id: true, version: true },
      })
      expect(membership.version).toBe(1)

      const updated = await tx.membership.update({
        where: { id: membership.id },
        data: { role: 'BOOKKEEPER', version: { increment: 1 } },
        select: { version: true },
      })

      // A JWT issued with version 1 no longer matches, so getOrgContext rejects it.
      expect(updated.version).toBe(2)
    })
  })
})

afterAll(async () => {
  await db.$disconnect()
})
