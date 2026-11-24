import { describe, expect, it } from 'vitest'
import { formatAmount } from './format'

describe('formatAmount', () => {
  it('uses the currency’s standard decimals without a hard-coded symbol', () => {
    expect(formatAmount(12.5, 'USD', 'en-US')).toBe('12.50')
    expect(formatAmount(399000, 'IQD', 'en-US')).toBe('399,000')
    expect(formatAmount(1.5, 'KWD', 'en-US')).toBe('1.500')
  })
  it('never hides decimals that are stored in ERPNext', () => {
    expect(formatAmount(12.345, 'USD', 'en-US')).toBe('12.345')
  })
  it('formats a real zero price', () => {
    expect(formatAmount(0, 'USD', 'en-US')).toBe('0.00')
  })
  it('falls back gracefully for unknown currency codes', () => {
    expect(formatAmount(3, 'XYZ1', 'en-US')).toBe('3.00')
  })
})
