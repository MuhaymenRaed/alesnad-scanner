import { describe, expect, it } from 'vitest'
import { MAX_BARCODE_LENGTH, validateBarcode } from './barcode.js'

describe('validateBarcode', () => {
  it('keeps leading zeros and inner characters; trims only the ends', () => {
    expect(validateBarcode('  00123 45-A/\n')).toEqual({ ok: true, value: '00123 45-A/' })
    expect(validateBarcode('0000000000000')).toEqual({ ok: true, value: '0000000000000' })
  })
  it('allows the GS1 group separator', () => {
    expect(validateBarcode('0104012345678901\u001d10ABC').ok).toBe(true)
  })
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['1'.repeat(MAX_BARCODE_LENGTH + 1), 'too_long'],
    ['12\u000034', 'invalid_characters'],
    ['12\n34', 'invalid_characters'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(validateBarcode(input)).toMatchObject({ ok: false, reason })
  })
  it('rejects non-strings such as numbers or arrays', () => {
    expect(validateBarcode(123)).toMatchObject({ ok: false, reason: 'not_a_string' })
    expect(validateBarcode(['1', '2'])).toMatchObject({ ok: false, reason: 'not_a_string' })
  })
})
