/**
 * What "delete this" means for one document, decided in one place.
 *
 * There are two honest answers, and which applies depends on whether the ledger
 * has heard of the document:
 *
 *   **Nothing posted** — a draft, an estimate, a purchase order. The ledger has
 *   never seen it, nobody outside the business holds the number, and nothing
 *   references it. It can simply go. Refusing to delete these is what left every
 *   list full of mistakes nobody was allowed to tidy up.
 *
 *   **Posted** — an invoice, a bill, a payment, a transfer. Deleting it would
 *   remove a document number somebody is holding and a figure a report has
 *   already shown. So it is *voided*: the journal is reversed, any stock comes
 *   back, and the document stays readable with VOID across it. A missing number
 *   is a question nobody can answer later; a voided one answers it.
 *
 * Isomorphic on purpose. The service enforces it and the row menu reads it, so
 * a screen cannot offer something the server will refuse.
 */
export type DispositionAction = 'delete' | 'void' | 'blocked'

export type Disposition = {
  action: DispositionAction
  /** Said plainly, and shown to the user as-is. */
  reason: string
}

export type DispositionSubject = {
  status: string
  /** Null while nothing has been posted. */
  journalId?: string | null
  /** Set when an estimate became an invoice, or an order became a bill. */
  convertedToId?: string | null
  /** Payments and credits applied to it. */
  appliedCount?: number
}

export function dispositionOf(document: DispositionSubject): Disposition {
  if (document.status === 'VOID') {
    return { action: 'blocked', reason: 'It is already void.' }
  }
  if ((document.appliedCount ?? 0) > 0) {
    return {
      action: 'blocked',
      reason: 'Payments or credits are applied to it. Remove those first.',
    }
  }
  if (document.convertedToId) {
    return { action: 'blocked', reason: 'It has already become another document.' }
  }
  if (!document.journalId) {
    return { action: 'delete', reason: 'Nothing is posted, so there is nothing to keep.' }
  }
  return { action: 'void', reason: 'It is in the ledger, so it is reversed rather than removed.' }
}

/** The verb to put on the button. */
export const dispositionLabel = (action: DispositionAction): string =>
  action === 'delete' ? 'Delete' : action === 'void' ? 'Void' : 'Delete'
