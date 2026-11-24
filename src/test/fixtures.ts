import type { Product } from '../../shared/api'

/** A normalized product as the backend returns it (test data only — not a live ERPNext record). */
export function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    itemCode: 'ITEM-0001',
    itemName: 'Example Phone',
    matchedBy: 'barcode',
    barcode: '0123456789012',
    barcodeType: 'EAN',
    barcodeUom: null,
    uom: 'Nos',
    stockUom: 'Nos',
    description: 'Example description',
    itemGroup: 'Phones',
    brand: 'Example Brand',
    hasImage: false,
    weight: null,
    isStockItem: true,
    disabled: false,
    hasVariants: false,
    variantOf: null,
    uomConversions: [],
    metadata: [{ field: 'custom_color', label: 'Device Color', value: 'Black' }],
    sellingPrice: 12.5,
    currency: 'USD',
    priceList: 'Standard Selling',
    price: {
      status: 'available',
      amount: 12.5,
      currency: 'USD',
      priceList: 'Standard Selling',
      uom: 'Nos',
      requestedUom: 'Nos',
      uomMatch: 'exact',
      validFrom: null,
      validUpto: null,
    },
    ...overrides,
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
