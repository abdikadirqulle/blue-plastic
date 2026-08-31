import { describe, expect, it } from 'vitest'

import { dispositionLabel, dispositionOf } from './document-disposition'

describe('what "delete this" means', () => {
  it('deletes a document the ledger has never seen', () => {
    const disposition = dispositionOf({ status: 'DRAFT', journalId: null })

    expect(disposition.action).toBe('delete')
    expect(dispositionLabel(disposition.action)).toBe('Delete')
  })

  it('voids a document that has been posted', () => {
    const disposition = dispositionOf({ status: 'OPEN', journalId: 'jrnl_1' })

    expect(disposition.action).toBe('void')
    expect(dispositionLabel(disposition.action)).toBe('Void')
  })

  it('refuses a document with money applied to it, and says why', () => {
    const disposition = dispositionOf({ status: 'PARTIAL', journalId: 'jrnl_1', appliedCount: 1 })

    expect(disposition.action).toBe('blocked')
    expect(disposition.reason).toMatch(/Remove those first/)
  })

  it('refuses one that has already become another document', () => {
    // An estimate that became an invoice, or an order that became a bill: the
    // later document points back at it, so it cannot go anywhere.
    const disposition = dispositionOf({ status: 'CLOSED', journalId: null, convertedToId: 'doc_2' })

    expect(disposition.action).toBe('blocked')
  })

  it('refuses one that is already void rather than voiding it twice', () => {
    expect(dispositionOf({ status: 'VOID', journalId: 'jrnl_1' }).action).toBe('blocked')
  })

  it('reads an applied count of zero as nothing applied', () => {
    expect(dispositionOf({ status: 'DRAFT', journalId: null, appliedCount: 0 }).action).toBe('delete')
  })
})
