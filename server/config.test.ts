import { describe, expect, it } from 'vitest'
import { createAccessPolicy } from './auth/accessPolicy.js'
import { ConfigError, loadAppConfig } from './config.js'

const valid = {
  ERPNEXT_BASE_URL: 'https://erp.example.com',
  ERPNEXT_API_KEY: 'key',
  ERPNEXT_API_SECRET: 'super-secret-value',
  CLERK_SECRET_KEY: 'sk_test_abc',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
}

describe('loadAppConfig', () => {
  it('applies documented defaults', () => {
    const config = loadAppConfig(valid)
    expect(config.erpnext.priceList).toBe('Standard Selling')
    expect(config.erpnext.matchItemCode).toBe(false)
    expect(config.erpnext.allowBuyingPriceList).toBe(false)
    expect(config.port).toBe(3001)
    expect(config.frontendOrigins).toEqual(['http://localhost:5173'])
    expect(config.clerk.publishableKey).toBe('pk_test_abc')
  })

  it('reports every missing variable by name without printing secret values', () => {
    try {
      loadAppConfig({ ERPNEXT_API_SECRET: 'super-secret-value' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      const message = (error as Error).message
      expect(message).toContain('ERPNEXT_BASE_URL')
      expect(message).toContain('ERPNEXT_API_KEY')
      expect(message).toContain('CLERK_SECRET_KEY')
      expect(message).not.toContain('super-secret-value')
    }
  })

  it('requires HTTPS and live Clerk keys in production', () => {
    expect(() => loadAppConfig({ ...valid, NODE_ENV: 'production', ERPNEXT_BASE_URL: 'http://erp.example.com' })).toThrow(/https/)
    expect(() =>
      loadAppConfig({ ...valid, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://scanner.example.com' }),
    ).toThrow(/development keys/)
  })

  it('parses lists (including Arabic item group names)', () => {
    const config = loadAppConfig({ ...valid, ERPNEXT_ITEM_GROUPS: 'الأجهزة, Phones ', ACCESS_ALLOWED_USER_IDS: 'user_1,user_2' })
    expect(config.erpnext.itemGroups).toEqual(['الأجهزة', 'Phones'])
    expect(config.access.allowedUserIds).toEqual(['user_1', 'user_2'])
  })
})

describe('access policy', () => {
  it('allows every authenticated user by default', () => {
    const policy = createAccessPolicy({ allowedUserIds: [], deniedUserIds: [] })
    expect(policy.mode).toBe('all-authenticated-users')
    expect(policy.evaluate({ userId: 'user_x' })).toEqual({ allowed: true })
  })
  it('applies the allowlist and denylist', () => {
    const policy = createAccessPolicy({ allowedUserIds: ['user_a', 'user_b'], deniedUserIds: ['user_b'] })
    expect(policy.evaluate({ userId: 'user_a' }).allowed).toBe(true)
    expect(policy.evaluate({ userId: 'user_b' })).toEqual({ allowed: false, reason: 'denied' })
    expect(policy.evaluate({ userId: 'user_c' })).toEqual({ allowed: false, reason: 'not_allowlisted' })
  })
})
