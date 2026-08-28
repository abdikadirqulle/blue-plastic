import { Decimal } from 'decimal.js'

/**
 * Money is a Decimal, always. It is stored as NUMERIC(19,4), travels as a decimal
 * string, and is formatted for display — it never becomes a JavaScript `number`
 * at any point. See ADR-0003.
 */
export type Money = Decimal

/** Storage scale. Unit prices and rates need more than 2 decimals; postings do not. */
export const STORAGE_SCALE = 4

/** Minor units per currency, for rounding amounts that will be posted. */
const MINOR_UNITS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, KES: 2, AED: 2, CAD: 2, AUD: 2, CHF: 2, ZAR: 2, INR: 2,
  SOS: 2, ETB: 2, NGN: 2, CNY: 2, SAR: 2, TRY: 2,
  JPY: 0, KRW: 0, UGX: 0, VND: 0, CLP: 0, ISK: 0, RWF: 0, DJF: 0,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3,
}

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2
}

export const ZERO: Money = new Decimal(0)

export function money(value: Decimal.Value | null | undefined): Money {
  if (value === null || value === undefined || value === '') return ZERO
  return new Decimal(value)
}

/**
 * Commercial rounding: half away from zero. Banker's rounding is defensible in
 * statistics and indefensible on an invoice a customer is holding.
 */
export function round(value: Decimal.Value, decimals: number): Money {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
}

/** Round to the currency's smallest postable unit. Every posted amount goes through this. */
export function roundToCurrency(value: Decimal.Value, currency: string): Money {
  return round(value, minorUnits(currency))
}

export function sum(values: Iterable<Decimal.Value>): Money {
  let total = ZERO
  for (const v of values) total = total.plus(v)
  return total
}

export const isZero = (v: Decimal.Value): boolean => new Decimal(v).isZero()
export const isNegative = (v: Decimal.Value): boolean => new Decimal(v).isNegative()
export const eq = (a: Decimal.Value, b: Decimal.Value): boolean => new Decimal(a).equals(b)

/** Canonical wire/storage form: a plain decimal string, never exponential notation. */
export function toMoneyString(value: Decimal.Value, decimals = STORAGE_SCALE): string {
  return new Decimal(value).toFixed(decimals)
}

/**
 * Parse user input. Accepts thousands separators and a leading currency symbol,
 * and rejects anything else rather than guessing — a silently-misparsed amount is
 * worse than a validation message.
 */
export function parseMoneyInput(input: string): Money | null {
  const cleaned = input.trim().replace(/[\s,]/g, '').replace(/^[^\d\-+.]+/, '')
  if (cleaned === '' || !/^[-+]?\d*\.?\d*$/.test(cleaned)) return null
  try {
    const d = new Decimal(cleaned)
    return d.isFinite() ? d : null
  } catch {
    return null
  }
}

export function formatMoney(
  value: Decimal.Value,
  currency = 'USD',
  options: { locale?: string; showSymbol?: boolean } = {},
): string {
  const { locale = 'en-US', showSymbol = true } = options
  const decimals = minorUnits(currency)
  const n = Number(round(value, decimals).toFixed(decimals))
  return new Intl.NumberFormat(locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/**
 * Display a ledger amount by its natural side. Accounting reports show a credit
 * balance on a revenue account as a positive number, not as a negative asset.
 */
export function formatSigned(value: Decimal.Value, currency = 'USD'): string {
  const d = new Decimal(value)
  return d.isNegative() ? `(${formatMoney(d.abs(), currency)})` : formatMoney(d, currency)
}

/**
 * Split an amount into `parts` pieces that sum exactly to the original.
 * Used wherever a total must be allocated across lines (tax, discounts,
 * payment application) without losing or inventing a cent.
 */
export function allocate(total: Decimal.Value, weights: Decimal.Value[], currency = 'USD'): Money[] {
  const amount = new Decimal(total)
  const weightTotal = sum(weights)
  if (weightTotal.isZero()) return weights.map(() => ZERO)

  const decimals = minorUnits(currency)
  const allocated: Money[] = []
  let running = ZERO

  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) {
      allocated.push(round(amount.minus(running), decimals))
    } else {
      const share = round(amount.times(weights[i]).dividedBy(weightTotal), decimals)
      allocated.push(share)
      running = running.plus(share)
    }
  }
  return allocated
}

export { Decimal }
