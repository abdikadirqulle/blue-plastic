import 'server-only'

import { Decimal, roundToCurrency, ZERO } from '@/lib/money'

/**
 * Tax computation.
 *
 * Two rules decide almost every argument about a tax figure:
 *
 * 1. **Tax is computed per line, then rounded per line, then summed.** Computing
 *    on the document total and back-allocating produces a total that disagrees
 *    with the printed invoice by a cent, which customers do notice.
 * 2. **A compound rate is charged on the running total**, including the rates
 *    applied before it — which is why a code's components carry a sequence.
 *
 * Rates are fractions (0.15), never percentages, and are held to nine decimal
 * places so a third-of-a-percent levy survives the arithmetic.
 */
export type TaxComponent = {
  taxRateId: string
  name: string
  rate: Decimal.Value
  sequence: number
  isCompound: boolean
  salesAccountId: string | null
  purchaseAccountId: string | null
}

export type TaxCodeShape = {
  id: string
  name: string
  isInclusive: boolean
  components: TaxComponent[]
}

export type TaxComponentResult = {
  taxRateId: string
  name: string
  rate: Decimal
  amount: Decimal
  salesAccountId: string | null
  purchaseAccountId: string | null
}

export type TaxResult = {
  /** The amount tax is charged on, exclusive of tax. */
  net: Decimal
  tax: Decimal
  gross: Decimal
  components: TaxComponentResult[]
}

/**
 * Tax for one line.
 *
 * `amount` is the line total as entered. For an inclusive code that figure
 * already contains the tax and the tax is extracted from it; for an exclusive
 * code the tax is added on top.
 */
export function computeLineTax(
  amount: Decimal.Value,
  code: TaxCodeShape | null,
  currency: string,
): TaxResult {
  const entered = new Decimal(amount)

  if (!code || code.components.length === 0) {
    const net = roundToCurrency(entered, currency)
    return { net, tax: ZERO, gross: net, components: [] }
  }

  const ordered = [...code.components].sort((a, b) => a.sequence - b.sequence)

  const net = code.isInclusive
    ? extractNet(entered, ordered, currency)
    : roundToCurrency(entered, currency)

  const components: TaxComponentResult[] = []
  let runningBase = net
  let tax = ZERO

  for (const component of ordered) {
    // A compound rate is charged on the net plus the tax already added.
    const base = component.isCompound ? runningBase : net
    const amount = roundToCurrency(base.times(component.rate), currency)

    components.push({
      taxRateId: component.taxRateId,
      name: component.name,
      rate: new Decimal(component.rate),
      amount,
      salesAccountId: component.salesAccountId,
      purchaseAccountId: component.purchaseAccountId,
    })

    tax = tax.plus(amount)
    runningBase = runningBase.plus(amount)
  }

  return { net, tax, gross: net.plus(tax), components }
}

/**
 * Recover the tax-exclusive amount from a tax-inclusive one.
 *
 * For simple rates the divisor is 1 + Σr. Compounding multiplies instead of
 * adding, because each compound rate is charged on the total the ones before it
 * produced. Solving it this way keeps net + tax exactly equal to the price the
 * customer was quoted, which is the only outcome that matters.
 */
function extractNet(gross: Decimal, components: TaxComponent[], currency: string): Decimal {
  let divisor = new Decimal(1)
  let simple = ZERO

  for (const component of components) {
    if (component.isCompound) {
      divisor = divisor.plus(simple).times(new Decimal(1).plus(component.rate)).minus(simple)
    } else {
      simple = simple.plus(component.rate)
    }
  }

  return roundToCurrency(gross.dividedBy(divisor.plus(simple)), currency)
}

/**
 * Tax across a document.
 *
 * Sums the per-line results rather than recomputing on the total, so the figure
 * on the invoice is the sum of the figures on its lines — by construction, not
 * by coincidence.
 */
export function summariseTax(results: TaxResult[]): {
  net: Decimal
  tax: Decimal
  gross: Decimal
  byRate: Map<string, { name: string; amount: Decimal; salesAccountId: string | null; purchaseAccountId: string | null }>
} {
  const byRate = new Map<
    string,
    { name: string; amount: Decimal; salesAccountId: string | null; purchaseAccountId: string | null }
  >()

  let net = ZERO
  let tax = ZERO

  for (const result of results) {
    net = net.plus(result.net)
    tax = tax.plus(result.tax)

    for (const component of result.components) {
      const existing = byRate.get(component.taxRateId)
      if (existing) {
        existing.amount = existing.amount.plus(component.amount)
      } else {
        byRate.set(component.taxRateId, {
          name: component.name,
          amount: component.amount,
          salesAccountId: component.salesAccountId,
          purchaseAccountId: component.purchaseAccountId,
        })
      }
    }
  }

  return { net, tax, gross: net.plus(tax), byRate }
}
