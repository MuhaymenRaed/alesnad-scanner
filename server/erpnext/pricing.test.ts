import { describe, expect, it } from 'vitest'
import { selectSellingPrice, type ItemPriceRecord, type PriceContext } from './pricing.js'

const ctx: PriceContext = {
  itemCode: 'ITEM-1',
  priceList: 'Retail',
  requestedUom: 'Nos',
  stockUom: 'Nos',
  today: '2026-06-15',
  allowBuyingPriceList: false,
}

let seq = 0
const price = (overrides: Partial<ItemPriceRecord> = {}): ItemPriceRecord => ({
  name: `ip-${++seq}`,
  item_code: 'ITEM-1',
  price_list: 'Retail',
  price_list_rate: 10,
  currency: 'IQD',
  uom: 'Nos',
  valid_from: null,
  valid_upto: null,
  customer: null,
  supplier: null,
  batch_no: null,
  buying: 0,
  selling: 1,
  modified: '2026-01-01 10:00:00',
  ...overrides,
})

describe('selectSellingPrice', () => {
  it('returns the price, currency, unit and list', () => {
    expect(selectSellingPrice([price({ price_list_rate: 12500 })], ctx)).toEqual({
      status: 'available',
      amount: 12500,
      currency: 'IQD',
      priceList: 'Retail',
      uom: 'Nos',
      requestedUom: 'Nos',
      uomMatch: 'exact',
      validFrom: null,
      validUpto: null,
    })
  })

  it('ignores records of other items or other price lists (no fallback list)', () => {
    const result = selectSellingPrice([price({ price_list: 'Wholesale' }), price({ item_code: 'ITEM-2' })], ctx)
    expect(result).toMatchObject({ status: 'unavailable', reason: 'NO_PRICE_IN_LIST', priceList: 'Retail' })
  })

  it('rejects buying prices unless explicitly allowed', () => {
    expect(selectSellingPrice([price({ selling: 0, buying: 1 })], ctx)).toMatchObject({ reason: 'NOT_A_SELLING_PRICE_LIST' })
    expect(selectSellingPrice([price({ buying: 1 })], ctx)).toMatchObject({ reason: 'PRICE_LIST_IS_BUYING_LIST' })
    expect(selectSellingPrice([price({ buying: 1 })], { ...ctx, allowBuyingPriceList: true })).toMatchObject({ status: 'available' })
  })

  it('excludes customer, supplier and batch-specific prices', () => {
    const records = [price({ customer: 'CUST-1' }), price({ supplier: 'SUP-1' }), price({ batch_no: 'B1' })]
    expect(selectSellingPrice(records, ctx)).toMatchObject({ reason: 'NO_VALID_PRICE' })
    expect(selectSellingPrice([...records, price({ price_list_rate: 7 })], ctx)).toMatchObject({ amount: 7 })
  })

  it('respects validity dates (inclusive bounds)', () => {
    expect(selectSellingPrice([price({ valid_from: '2026-06-16' })], ctx)).toMatchObject({ reason: 'NO_VALID_PRICE' })
    expect(selectSellingPrice([price({ valid_upto: '2026-06-14' })], ctx)).toMatchObject({ reason: 'NO_VALID_PRICE' })
    expect(selectSellingPrice([price({ valid_from: '2026-06-15', valid_upto: '2026-06-15' })], ctx)).toMatchObject({ status: 'available' })
  })

  it('prefers the most recent valid_from, deterministically', () => {
    const records = [
      price({ name: 'old', valid_from: '2026-01-01', price_list_rate: 100 }),
      price({ name: 'undated', valid_from: null, price_list_rate: 90 }),
      price({ name: 'new', valid_from: '2026-05-01', price_list_rate: 120 }),
      price({ name: 'future', valid_from: '2026-07-01', price_list_rate: 999 }),
    ]
    expect(selectSellingPrice(records, ctx)).toMatchObject({ amount: 120, validFrom: '2026-05-01' })
    expect(selectSellingPrice([...records].reverse(), ctx)).toMatchObject({ amount: 120 })
  })

  it('breaks exact ties by explicit unit, then latest modification, then name', () => {
    const blankUom = price({ name: 'a', uom: null, price_list_rate: 1, modified: '2026-03-01' })
    const explicit = price({ name: 'b', uom: 'Nos', price_list_rate: 2, modified: '2026-01-01' })
    expect(selectSellingPrice([blankUom, explicit], ctx)).toMatchObject({ amount: 2 })
    const newer = price({ name: 'c', price_list_rate: 3, modified: '2026-04-01' })
    const older = price({ name: 'd', price_list_rate: 4, modified: '2026-02-01' })
    expect(selectSellingPrice([older, newer], ctx)).toMatchObject({ amount: 3 })
    const sameA = price({ name: 'x1', price_list_rate: 5 })
    const sameB = price({ name: 'x2', price_list_rate: 6 })
    expect(selectSellingPrice([sameB, sameA], ctx)).toMatchObject({ amount: 5 })
  })

  it('treats a blank-unit price as the stock unit', () => {
    expect(selectSellingPrice([price({ uom: null })], ctx)).toMatchObject({ status: 'available', uom: 'Nos' })
  })

  it('matches the requested unit first, then falls back to the stock unit with a label', () => {
    const box = { ...ctx, requestedUom: 'Box' }
    expect(selectSellingPrice([price({ uom: 'Nos', price_list_rate: 10 }), price({ uom: 'Box', price_list_rate: 115 })], box))
      .toMatchObject({ amount: 115, uom: 'Box', uomMatch: 'exact' })
    expect(selectSellingPrice([price({ uom: 'Nos', price_list_rate: 10 })], box))
      .toMatchObject({ amount: 10, uom: 'Nos', requestedUom: 'Box', uomMatch: 'stock_uom_fallback' })
  })

  it('reports prices that exist only for other units', () => {
    expect(selectSellingPrice([price({ uom: 'Carton' })], ctx)).toMatchObject({
      status: 'unavailable',
      reason: 'NO_PRICE_FOR_UOM',
      availableUoms: ['Carton'],
    })
  })

  it('never invents a price: missing rate or currency is not eligible', () => {
    expect(selectSellingPrice([price({ price_list_rate: null })], ctx)).toMatchObject({ reason: 'NO_VALID_PRICE' })
    expect(selectSellingPrice([price({ currency: '' })], ctx)).toMatchObject({ reason: 'NO_VALID_PRICE' })
  })

  it('keeps a genuine zero price', () => {
    expect(selectSellingPrice([price({ price_list_rate: 0 })], ctx)).toMatchObject({ status: 'available', amount: 0 })
  })
})
