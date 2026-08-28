import 'server-only'

import { Decimal, roundToCurrency, ZERO } from '@/lib/money'
import { computeLineTax, summariseTax, type TaxCodeShape, type TaxResult } from './tax'

export type DraftSalesLine = {
  itemId?: string | null
  description?: string | null
  quantity: Decimal.Value
  unitPrice: Decimal.Value
  discountPercent?: Decimal.Value | null
  taxCodeId?: string | null
  incomeAccountId?: string | null
  serviceDate?: string | null
}

export type PricedLine = {
  source: DraftSalesLine
  lineNumber: number
  quantity: Decimal
  unitPrice: Decimal
  /** Tax-exclusive line total after the line discount. */
  amount: Decimal
  taxAmount: Decimal
  tax: TaxResult
  incomeAccountId: string | null
  taxCodeId: string | null
}

export type PricedDocument = {
  lines: PricedLine[]
  subtotal: Decimal
  /** Document-level discount. Line discounts are already inside `subtotal`. */
  discountAmount: Decimal
  /** What the line discounts came to, for showing on the document. */
  lineDiscountTotal: Decimal
  taxTotal: Decimal
  total: Decimal
  /** Tax owed per rate, ready to become one journal line each. */
  taxByRate: Map<
    string,
    { name: string; amount: Decimal; salesAccountId: string | null; purchaseAccountId: string | null }
  >
}

/**
 * Price a document.
 *
 * The order of operations is the whole of it, and it is not arbitrary:
 *
 *   quantity x unit price  ->  less the line discount  ->  tax on what remains
 *
 * Tax is charged on the discounted amount because that is what the customer is
 * actually being charged. Applying the discount after tax would collect tax on
 * money nobody paid.
 *
 * Every line is rounded to the currency before it is summed — see the note in
 * `tax.ts` on why the document total is the sum of its lines rather than a
 * calculation on the whole.
 */
export function priceDocument(
  lines: DraftSalesLine[],
  taxCodes: Map<string, TaxCodeShape>,
  currency: string,
): PricedDocument {
  const priced: PricedLine[] = []
  let subtotal = ZERO
  let lineDiscountTotal = ZERO

  lines.forEach((line, index) => {
    const quantity = new Decimal(line.quantity)
    const unitPrice = new Decimal(line.unitPrice)
    const gross = roundToCurrency(quantity.times(unitPrice), currency)

    const discountPercent = line.discountPercent ? new Decimal(line.discountPercent) : ZERO
    const discount = discountPercent.isZero()
      ? ZERO
      : roundToCurrency(gross.times(discountPercent).dividedBy(100), currency)

    const amount = gross.minus(discount)

    const code = line.taxCodeId ? (taxCodes.get(line.taxCodeId) ?? null) : null
    const tax = computeLineTax(amount, code, currency)

    // For an inclusive code the entered price already contained the tax, so the
    // revenue recognised is the extracted net, not the price on the line.
    const net = code?.isInclusive ? tax.net : amount

    priced.push({
      source: line,
      lineNumber: index + 1,
      quantity,
      unitPrice,
      amount: net,
      taxAmount: tax.tax,
      tax,
      incomeAccountId: line.incomeAccountId ?? null,
      taxCodeId: line.taxCodeId ?? null,
    })

    subtotal = subtotal.plus(net)
    lineDiscountTotal = lineDiscountTotal.plus(discount)
  })

  const summary = summariseTax(priced.map((line) => line.tax))

  return {
    lines: priced,
    subtotal,
    // Line discounts are already inside each line's amount. Subtracting them
    // again at document level would take them off twice.
    discountAmount: ZERO,
    lineDiscountTotal,
    taxTotal: summary.tax,
    total: subtotal.plus(summary.tax),
    taxByRate: summary.byRate,
  }
}
