import { describe, expect, it } from 'vitest'

import { computeLineTax, summariseTax, type TaxCodeShape } from './tax'

const code = (
  overrides: Partial<TaxCodeShape> & { components: TaxCodeShape['components'] },
): TaxCodeShape => ({
  id: 'code',
  name: 'Test',
  isInclusive: false,
  ...overrides,
})

const rate = (
  name: string,
  value: string,
  options: { sequence?: number; isCompound?: boolean } = {},
) => ({
  taxRateId: name,
  name,
  rate: value,
  sequence: options.sequence ?? 1,
  isCompound: options.isCompound ?? false,
  salesAccountId: 'sales-tax-payable',
  purchaseAccountId: null,
})

describe('no tax', () => {
  it('leaves the amount alone when there is no code', () => {
    const result = computeLineTax('100', null, 'USD')
    expect(result.net.toString()).toBe('100')
    expect(result.tax.toString()).toBe('0')
    expect(result.gross.toString()).toBe('100')
  })

  it('leaves the amount alone when the code has no rates', () => {
    const result = computeLineTax('100', code({ components: [] }), 'USD')
    expect(result.tax.toString()).toBe('0')
  })
})

describe('exclusive tax', () => {
  it('adds the tax on top', () => {
    const result = computeLineTax('100', code({ components: [rate('VAT', '0.15')] }), 'USD')
    expect(result.net.toString()).toBe('100')
    expect(result.tax.toString()).toBe('15')
    expect(result.gross.toString()).toBe('115')
  })

  it('rounds the tax to the currency, per line', () => {
    // 33.33 x 16% = 5.3328
    const result = computeLineTax('33.33', code({ components: [rate('VAT', '0.16')] }), 'USD')
    expect(result.tax.toString()).toBe('5.33')
    expect(result.gross.toString()).toBe('38.66')
  })

  it('handles a rate with more precision than two decimals', () => {
    // A third of a percent must survive the arithmetic.
    const result = computeLineTax('1000', code({ components: [rate('Levy', '0.00333')] }), 'USD')
    expect(result.tax.toString()).toBe('3.33')
  })

  it('adds several independent rates to the same net', () => {
    const result = computeLineTax(
      '200',
      code({ components: [rate('State', '0.06', { sequence: 1 }), rate('City', '0.02', { sequence: 2 })] }),
      'USD',
    )
    expect(result.tax.toString()).toBe('16')
    expect(result.components.map((c) => c.amount.toString())).toEqual(['12', '4'])
  })
})

describe('compound tax', () => {
  it('charges a compound rate on the running total, not on the net', () => {
    // 100 net, 5% first = 5, then 10% compound on 105 = 10.50. Total 15.50,
    // not the 15.00 that two independent rates would give.
    const result = computeLineTax(
      '100',
      code({
        components: [
          rate('GST', '0.05', { sequence: 1 }),
          rate('PST', '0.10', { sequence: 2, isCompound: true }),
        ],
      }),
      'USD',
    )
    expect(result.components.map((c) => c.amount.toString())).toEqual(['5', '10.5'])
    expect(result.tax.toString()).toBe('15.5')
    expect(result.gross.toString()).toBe('115.5')
  })

  it('respects the sequence, because the order changes the answer', () => {
    const compoundSecond = computeLineTax(
      '100',
      code({
        components: [
          rate('A', '0.10', { sequence: 1 }),
          rate('B', '0.05', { sequence: 2, isCompound: true }),
        ],
      }),
      'USD',
    )
    const compoundFirst = computeLineTax(
      '100',
      code({
        components: [
          rate('B', '0.05', { sequence: 1, isCompound: true }),
          rate('A', '0.10', { sequence: 2 }),
        ],
      }),
      'USD',
    )
    expect(compoundSecond.tax.toString()).toBe('15.5')
    expect(compoundFirst.tax.toString()).toBe('15')
  })
})

describe('inclusive tax', () => {
  it('extracts the tax from a price that already contains it', () => {
    // 115 at 15% inclusive is 100 net and 15 tax.
    const result = computeLineTax(
      '115',
      code({ isInclusive: true, components: [rate('VAT', '0.15')] }),
      'USD',
    )
    expect(result.net.toString()).toBe('100')
    expect(result.tax.toString()).toBe('15')
    expect(result.gross.toString()).toBe('115')
  })

  it('keeps net plus tax equal to the price the customer was quoted', () => {
    // The property that actually matters: an inclusive price must not move.
    for (const price of ['99.99', '10', '1234.56', '0.05', '7.77']) {
      const result = computeLineTax(
        price,
        code({ isInclusive: true, components: [rate('VAT', '0.16')] }),
        'USD',
      )
      expect(result.net.plus(result.tax).toString(), `price ${price}`).toBe(
        result.gross.toString(),
      )
      // Within a cent of the quoted price after rounding.
      expect(result.gross.minus(price).abs().lessThanOrEqualTo('0.01'), `price ${price}`).toBe(true)
    }
  })

  it('extracts several inclusive rates together', () => {
    // 108 inclusive of 6% + 2% is 100 net.
    const result = computeLineTax(
      '108',
      code({
        isInclusive: true,
        components: [rate('State', '0.06', { sequence: 1 }), rate('City', '0.02', { sequence: 2 })],
      }),
      'USD',
    )
    expect(result.net.toString()).toBe('100')
    expect(result.tax.toString()).toBe('8')
  })

  it('extracts a compound inclusive rate', () => {
    // 115.50 inclusive of 5% then 10% compound is 100 net.
    const result = computeLineTax(
      '115.50',
      code({
        isInclusive: true,
        components: [
          rate('GST', '0.05', { sequence: 1 }),
          rate('PST', '0.10', { sequence: 2, isCompound: true }),
        ],
      }),
      'USD',
    )
    expect(result.net.toString()).toBe('100')
    expect(result.tax.toString()).toBe('15.5')
  })
})

describe('document totals', () => {
  it('sums the lines rather than recomputing on the total', () => {
    // 33.33 x 16% = 5.3328 -> 5.33, twice; 33.34 x 16% = 5.3344 -> 5.33.
    // The lines sum to 15.99. Computing on the 100.00 total would say 16.00.
    // The invoice must show what its own lines add up to.
    const taxCode = code({ components: [rate('VAT', '0.16')] })
    const lines = ['33.33', '33.33', '33.34'].map((amount) =>
      computeLineTax(amount, taxCode, 'USD'),
    )
    expect(lines.map((line) => line.tax.toString())).toEqual(['5.33', '5.33', '5.33'])

    const summary = summariseTax(lines)
    expect(summary.net.toString()).toBe('100')
    expect(summary.tax.toString()).toBe('15.99')
    expect(summary.gross.toString()).toBe('115.99')

    // The one-cent gap against 16.00 is the point, not a defect: it is the
    // difference between what the document says and what a shortcut would say.
    expect(summary.tax.equals('16')).toBe(false)
  })

  it('groups the tax by rate, ready for the return', () => {
    const taxCode = code({
      components: [rate('State', '0.06', { sequence: 1 }), rate('City', '0.02', { sequence: 2 })],
    })
    const summary = summariseTax([
      computeLineTax('100', taxCode, 'USD'),
      computeLineTax('200', taxCode, 'USD'),
    ])

    expect(summary.byRate.get('State')?.amount.toString()).toBe('18')
    expect(summary.byRate.get('City')?.amount.toString()).toBe('6')
    expect(summary.tax.toString()).toBe('24')
  })

  it('totals nothing for an empty document', () => {
    const summary = summariseTax([])
    expect(summary.net.toString()).toBe('0')
    expect(summary.tax.toString()).toBe('0')
  })
})
