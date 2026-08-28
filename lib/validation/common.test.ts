import { describe, expect, it } from 'vitest'

import { listQuerySchema, moneyString, paginate, paged, parseListQuery } from './common'

describe('list query', () => {
  it('applies defaults', () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25, dir: 'asc' })
  })

  it('caps page size so a client cannot ask for the whole table', () => {
    expect(listQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false)
    expect(parseListQuery({ pageSize: '1000' }).pageSize).toBe(25)
  })

  it('falls back to defaults on nonsense input rather than throwing', () => {
    expect(parseListQuery({ page: 'banana' })).toMatchObject({ page: 1, pageSize: 25 })
  })

  it('takes the first value of a repeated parameter', () => {
    expect(parseListQuery({ q: ['acme', 'other'] }).q).toBe('acme')
  })

  it('computes offsets', () => {
    expect(paginate({ page: 3, pageSize: 25, dir: 'asc' })).toEqual({ skip: 50, take: 25 })
  })

  it('reports at least one page even when empty', () => {
    expect(paged([], 0, { page: 1, pageSize: 25, dir: 'asc' }).pageCount).toBe(1)
  })
})

describe('moneyString', () => {
  it('accepts decimal strings within storage scale', () => {
    for (const value of ['0', '10', '10.5', '-10.5000', '1234567.1234']) {
      expect(moneyString.safeParse(value).success, value).toBe(true)
    }
  })

  it('rejects floats, exponentials and over-scale values', () => {
    for (const value of ['1e5', '10.12345', 'abc', '1,000', '']) {
      expect(moneyString.safeParse(value).success, value).toBe(false)
    }
  })
})
