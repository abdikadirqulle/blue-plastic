import { describe, expect, it } from 'vitest'

import { ASSIGNABLE_ROLES } from '@/lib/roles'
import { PERMISSIONS, ROLE_PERMISSIONS, can, permissionsFor } from './permissions'

describe('permission matrix', () => {
  it('gives the owner everything', () => {
    for (const permission of PERMISSIONS) {
      expect(can('OWNER', permission)).toBe(true)
    }
  })

  it('gives a viewer reads and nothing else', () => {
    const viewer = ROLE_PERMISSIONS.VIEWER
    for (const permission of viewer) {
      expect(permission.endsWith(':read')).toBe(true)
    }
    expect(can('VIEWER', 'invoice:create')).toBe(false)
    expect(can('VIEWER', 'journal:post')).toBe(false)
  })

  it('separates transaction entry from ledger authority', () => {
    // A bookkeeper enters the day's work; only an accountant may post a manual
    // journal, reconcile a bank account or close a period.
    expect(can('BOOKKEEPER', 'invoice:create')).toBe(true)
    expect(can('BOOKKEEPER', 'bill:create')).toBe(true)
    expect(can('BOOKKEEPER', 'journal:post')).toBe(false)
    expect(can('BOOKKEEPER', 'period:close')).toBe(false)
    expect(can('BOOKKEEPER', 'bank:reconcile')).toBe(false)

    expect(can('ACCOUNTANT', 'journal:post')).toBe(true)
    expect(can('ACCOUNTANT', 'period:close')).toBe(true)
    expect(can('ACCOUNTANT', 'bank:reconcile')).toBe(true)
  })

  it('keeps sales away from the ledger and from other people', () => {
    expect(can('SALES', 'invoice:create')).toBe(true)
    expect(can('SALES', 'payment:create')).toBe(true)
    expect(can('SALES', 'account:create')).toBe(false)
    expect(can('SALES', 'journal:read')).toBe(false)
    expect(can('SALES', 'bill:create')).toBe(false)
    expect(can('SALES', 'user:invite')).toBe(false)
  })

  it('keeps user management to admins and the owner', () => {
    expect(can('ADMIN', 'user:remove')).toBe(true)
    expect(can('ACCOUNTANT', 'user:remove')).toBe(false)
    expect(can('BOOKKEEPER', 'user:invite')).toBe(false)
  })

  it('escalates monotonically: each role contains the one below it', () => {
    const chain = ['VIEWER', 'BOOKKEEPER', 'ACCOUNTANT', 'ADMIN', 'OWNER'] as const
    for (let i = 1; i < chain.length; i++) {
      const lower = ROLE_PERMISSIONS[chain[i - 1]]
      const higher = ROLE_PERMISSIONS[chain[i]]
      for (const permission of lower) {
        expect(
          higher.has(permission),
          `${chain[i]} should include ${chain[i - 1]}'s "${permission}"`,
        ).toBe(true)
      }
    }
  })

  it('never offers OWNER as an assignable role', () => {
    // Ownership moves by explicit transfer, so an admin cannot mint a second owner.
    expect(ASSIGNABLE_ROLES).not.toContain('OWNER')
  })

  it('falls back to viewer for an unknown role', () => {
    expect(permissionsFor('NOPE' as never)).toBe(ROLE_PERMISSIONS.VIEWER)
  })

  it('declares no duplicate permissions', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
  })
})
