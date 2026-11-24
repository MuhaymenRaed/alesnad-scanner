import { describe, expect, it } from 'vitest'
import { buildMetadata, htmlToText, isFieldDenied, requestedUomFor, resolveImagePath, type ItemDoc } from './normalize.js'
import { defaultSchema, parseSchema } from './schema.js'

describe('htmlToText', () => {
  it('strips tags and scripts and decodes entities', () => {
    expect(htmlToText('<div><p>Line&nbsp;1</p><p>A &amp; B &#1575;</p><script>x()</script></div>')).toBe('Line 1\nA & B ا')
  })
  it('keeps plain (including Arabic) text untouched', () => {
    expect(htmlToText('شاومي Redmi pad 2')).toBe('شاومي Redmi pad 2')
  })
})

describe('buildMetadata', () => {
  const doc: ItemDoc = {
    name: 'X',
    country_of_origin: 'Iraq',
    custom_color: 'Black',
    valuation_rate: 9,
    disabled: 0,
    custom_missing: null,
    taxes: [{ item_tax_template: 'VAT' }],
  }

  it('returns only configured, existing, safe, non-empty fields with real labels', () => {
    const schema = defaultSchema()
    schema.source = 'metadata'
    schema.itemFields.set('custom_color', { label: 'Device Color', fieldtype: 'Data' })
    schema.itemFields.set('taxes', { label: 'Taxes', fieldtype: 'Table' })
    const fields = ['country_of_origin', 'custom_color', 'valuation_rate', 'custom_missing', 'taxes', 'not_on_site']
    expect(buildMetadata(doc, fields, schema)).toEqual([
      { field: 'country_of_origin', label: 'Country of Origin', value: 'Iraq' },
      { field: 'custom_color', label: 'Device Color', value: 'Black' },
    ])
  })

  it('falls back to readable labels when metadata is unavailable', () => {
    expect(buildMetadata({ name: 'X', custom_device_ram: '8 GB' }, ['custom_device_ram'], defaultSchema())).toEqual([
      { field: 'custom_device_ram', label: 'Device ram', value: '8 GB' },
    ])
  })

  it('denies cost, supplier and accounting fields regardless of configuration', () => {
    for (const field of ['valuation_rate', 'last_purchase_rate', 'standard_rate', 'supplier_items', 'income_account', 'opening_cost']) {
      expect(isFieldDenied(field)).toBe(true)
    }
    expect(isFieldDenied('custom_device_color')).toBe(false)
  })
})

describe('resolveImagePath', () => {
  const base = 'https://erp.example.com'
  it.each([
    ['/files/a.png', '/files/a.png'],
    ['/private/files/b c.jpg', '/private/files/b%20c.jpg'],
    ['https://erp.example.com/files/a.png', '/files/a.png'],
    ['https://cdn.example.com/a.png', null],
    ['/files/../api/resource/User', null],
    ['/app/item', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(resolveImagePath(input, base)).toBe(expected)
  })
})

describe('requestedUomFor', () => {
  it('uses barcode UOM, then sales UOM, then stock UOM', () => {
    expect(requestedUomFor({ name: 'X', stock_uom: 'Nos', sales_uom: 'Pack' }, { uom: 'Box' })).toBe('Box')
    expect(requestedUomFor({ name: 'X', stock_uom: 'Nos', sales_uom: 'Pack' }, { uom: null })).toBe('Pack')
    expect(requestedUomFor({ name: 'X', stock_uom: 'Nos' }, null)).toBe('Nos')
  })
})

describe('parseSchema', () => {
  it('finds the barcode child table by inspecting Item metadata', () => {
    const schema = parseSchema(
      {
        docs: [
          { name: 'Item', fields: [{ fieldname: 'codes', fieldtype: 'Table', options: 'Custom Barcode' }, { fieldname: 'item_name', fieldtype: 'Data', label: 'Name' }] },
          { name: 'Custom Barcode', fields: [{ fieldname: 'barcode', fieldtype: 'Data' }] },
        ],
      },
      null,
    )
    expect(schema).toMatchObject({ source: 'metadata', barcodeDoctype: 'Custom Barcode', barcodeTableField: 'codes' })
    expect([...schema.barcodeFields]).toEqual(['barcode'])
  })

  it('throws when Item has no barcode table (caller falls back to defaults)', () => {
    expect(() => parseSchema({ docs: [{ name: 'Item', fields: [] }] }, null)).toThrow()
  })
})
