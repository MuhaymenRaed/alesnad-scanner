import type { AppConfig } from '../config.js'
import { TEST_JWT_PUBLIC_KEY, TEST_ORIGIN, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY } from './clerkFixtures.js'

export const TEST_ERP_URL = 'https://erp.test.example'

export function testConfig(overrides: { erpnext?: Partial<AppConfig['erpnext']>; access?: Partial<AppConfig['access']>; lookupRateLimitPerMinute?: number } = {}): AppConfig {
  return {
    isProduction: false,
    port: 0,
    logLevel: 'silent',
    frontendOrigins: [TEST_ORIGIN],
    trustProxy: false,
    authorizeRequestHost: false,
    lookupRateLimitPerMinute: overrides.lookupRateLimitPerMinute ?? 1000,
    erpnext: {
      baseUrl: TEST_ERP_URL,
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      priceList: 'Standard Selling',
      allowBuyingPriceList: false,
      timeoutMs: 200,
      company: null,
      companyItemGroup: null,
      itemGroups: [],
      metadataFields: ['country_of_origin', 'custom_color', 'valuation_rate'],
      itemNameFields: ['item_name'],
      disabledItemPolicy: 'warn',
      matchItemCode: false,
      ...overrides.erpnext,
    },
    clerk: { publishableKey: TEST_PUBLISHABLE_KEY, secretKey: TEST_SECRET_KEY, jwtKey: TEST_JWT_PUBLIC_KEY },
    access: { allowedUserIds: [], deniedUserIds: [], ...overrides.access },
  }
}
