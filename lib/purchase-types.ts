import type { PurchaseDocumentType } from '@prisma/client'

export type PurchaseTypeConfig = {
  type: PurchaseDocumentType
  slug: string
  singular: string
  plural: string
  effect: string
  /** True when the money leaves at once and it never becomes a payable. */
  needsPaymentAccount: boolean
  posts: boolean
}

export const PURCHASE_TYPES: PurchaseTypeConfig[] = [
  {
    type: 'BILL',
    slug: 'bills',
    singular: 'Bill',
    plural: 'Bills',
    effect: 'You owe the vendor. Payables go up, the cost is recognised.',
    needsPaymentAccount: false,
    posts: true,
  },
  {
    type: 'EXPENSE',
    slug: 'expenses',
    singular: 'Expense',
    plural: 'Expenses',
    effect: 'Bought and paid at once. The money leaves an account and never becomes a payable.',
    needsPaymentAccount: true,
    posts: true,
  },
  {
    type: 'VENDOR_CREDIT',
    slug: 'vendor-credits',
    singular: 'Vendor credit',
    plural: 'Vendor credits',
    effect: 'The mirror of a bill. The cost comes back out and you owe less.',
    needsPaymentAccount: false,
    posts: true,
  },
  {
    type: 'PURCHASE_ORDER',
    slug: 'purchase-orders',
    singular: 'Purchase order',
    plural: 'Purchase orders',
    effect: 'An order placed. Nothing has happened yet, so nothing is posted to the ledger.',
    needsPaymentAccount: false,
    posts: false,
  },
]

export const purchaseBySlug = (slug: string) => PURCHASE_TYPES.find((c) => c.slug === slug)
export const purchaseByType = (type: PurchaseDocumentType) =>
  PURCHASE_TYPES.find((c) => c.type === type)!
