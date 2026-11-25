import type { LogLevel } from './logger.js'

/**
 * Server configuration, read from environment variables and validated at startup.
 * Error messages name the variables that are wrong but never print their values.
 */

export type DisabledItemPolicy = 'warn' | 'reject'

export interface ErpNextConfig {
  baseUrl: string
  apiKey: string
  apiSecret: string
  /** The selling price list prices are read from. Never silently replaced by another list. */
  priceList: string
  /** Allow a price list that is ALSO flagged as a buying list (off by default: it may hold costs). */
  allowBuyingPriceList: boolean
  timeoutMs: number
  /**
   * Optional company scope: only Items that have an Item Default row for this company
   * (Item → Item Defaults → Company) can be looked up. Null = all companies.
   */
  company: string | null
  /**
   * Item-group tree that marks the company's catalogue (default: a group named like the company).
   * Items with NO Item Defaults at all belong to the company when their group is inside this tree;
   * Items whose defaults name another company never do. Null disables this fallback.
   */
  companyItemGroup: string | null
  /** Optional item-group allowlist (descendant groups included). Empty = all groups. */
  itemGroups: string[]
  /** Extra Item fields (standard or custom) shown in the product details panel. */
  metadataFields: string[]
  /** Item fields tried in order for the product title (e.g. an Arabic name field, then item_name). */
  itemNameFields: string[]
  disabledItemPolicy: DisabledItemPolicy
  /** Opt-in: when no barcode matches, try an exact Item Code match. */
  matchItemCode: boolean
}

export interface ClerkConfig {
  publishableKey: string
  secretKey: string
  /** Optional PEM public key for networkless token verification (CLERK_JWT_KEY). */
  jwtKey?: string
}

export interface AppConfig {
  isProduction: boolean
  port: number
  logLevel: LogLevel | 'silent'
  /** Allowed browser origins — used for CORS and Clerk's authorized-parties (azp) check. */
  frontendOrigins: string[]
  trustProxy: boolean | number | string
  /** Accept Clerk tokens issued for https://<request Host> (platforms that route by Host only, e.g. Netlify). */
  authorizeRequestHost: boolean
  lookupRateLimitPerMinute: number
  erpnext: ErpNextConfig
  clerk: ClerkConfig
  access: {
    allowedUserIds: string[]
    deniedUserIds: string[]
  }
}

export class ConfigError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

type Env = Record<string, string | undefined>

const DEFAULT_METADATA_FIELDS = ['country_of_origin', 'customs_tariff_number', 'shelf_life_in_days', 'warranty_period']

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function bool(env: Env, name: string, fallback: boolean, problems: string[]): boolean {
  const raw = env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  problems.push(`${name} must be true or false.`)
  return fallback
}

function int(env: Env, name: string, fallback: number, min: number, max: number, problems: string[]): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be a whole number between ${min} and ${max}.`)
    return fallback
  }
  return value
}

function required(env: Env, name: string, problems: string[]): string {
  const value = env[name]?.trim() ?? ''
  if (!value) problems.push(`${name} is required.`)
  return value
}

function collectErpNext(env: Env, isProduction: boolean, problems: string[]): ErpNextConfig {
  const rawUrl = required(env, 'ERPNEXT_BASE_URL', problems)
  let baseUrl = ''
  if (rawUrl) {
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol')
      if (url.protocol === 'http:' && isProduction) {
        problems.push('ERPNEXT_BASE_URL must use https:// in production.')
      }
      baseUrl = url.origin
    } catch {
      problems.push('ERPNEXT_BASE_URL must be a full URL such as https://erp.example.com.')
    }
  }

  const metadataFields = env.ITEM_METADATA_FIELDS === undefined ? DEFAULT_METADATA_FIELDS : list(env.ITEM_METADATA_FIELDS)
  const invalidField = metadataFields.find((field) => !/^[a-z][a-z0-9_]*$/.test(field))
  if (invalidField !== undefined) problems.push('ITEM_METADATA_FIELDS must be a comma-separated list of ERPNext fieldnames.')

  const itemNameFields = env.ITEM_NAME_FIELDS === undefined ? ['item_name'] : list(env.ITEM_NAME_FIELDS)
  if (itemNameFields.some((field) => !/^[a-z][a-z0-9_]*$/.test(field))) problems.push('ITEM_NAME_FIELDS must be a comma-separated list of ERPNext fieldnames.')

  const policy = (env.DISABLED_ITEM_POLICY?.trim().toLowerCase() || 'warn') as DisabledItemPolicy
  if (policy !== 'warn' && policy !== 'reject') problems.push('DISABLED_ITEM_POLICY must be "warn" or "reject".')

  return {
    baseUrl,
    apiKey: required(env, 'ERPNEXT_API_KEY', problems),
    apiSecret: required(env, 'ERPNEXT_API_SECRET', problems),
    priceList: env.ERPNEXT_PRICE_LIST?.trim() || 'Standard Selling',
    allowBuyingPriceList: bool(env, 'ERPNEXT_ALLOW_BUYING_PRICE_LIST', false, problems),
    timeoutMs: int(env, 'ERPNEXT_TIMEOUT_MS', 10000, 500, 60000, problems),
    company: env.ERPNEXT_COMPANY?.trim() || null,
    companyItemGroup: (() => {
      const company = env.ERPNEXT_COMPANY?.trim()
      const group = env.ERPNEXT_COMPANY_ITEM_GROUP?.trim()
      if (!company || group?.toLowerCase() === 'none') return null
      return group || company
    })(),
    itemGroups: list(env.ERPNEXT_ITEM_GROUPS),
    metadataFields,
    itemNameFields,
    disabledItemPolicy: policy,
    matchItemCode: bool(env, 'LOOKUP_MATCH_ITEM_CODE', false, problems),
  }
}

/** ERPNext settings only — used by the diagnostic CLI, which needs no Clerk keys. */
export function loadErpNextConfig(env: Env = process.env): ErpNextConfig {
  const problems: string[] = []
  const config = collectErpNext(env, env.NODE_ENV === 'production', problems)
  if (problems.length > 0) throw new ConfigError(problems)
  return config
}

export function loadAppConfig(env: Env = process.env): AppConfig {
  const problems: string[] = []
  const isProduction = env.NODE_ENV === 'production'
  const erpnext = collectErpNext(env, isProduction, problems)

  const secretKey = required(env, 'CLERK_SECRET_KEY', problems)
  if (secretKey && !secretKey.startsWith('sk_')) problems.push('CLERK_SECRET_KEY must start with sk_.')
  // The publishable key is public; reuse the frontend's value if no backend-specific one is set.
  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim() || env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || ''
  if (!publishableKey) problems.push('CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY) is required.')
  else if (!publishableKey.startsWith('pk_')) problems.push('CLERK_PUBLISHABLE_KEY must start with pk_.')
  if (isProduction && (secretKey.startsWith('sk_test_') || publishableKey.startsWith('pk_test_'))) {
    problems.push('Clerk development keys (sk_test_/pk_test_) must not be used in production.')
  }

  const frontendOrigins = list(env.FRONTEND_ORIGIN ?? 'http://localhost:5173').map((origin) => {
    try {
      const url = new URL(origin)
      if (isProduction && url.protocol !== 'https:') problems.push('FRONTEND_ORIGIN must use https:// in production.')
      return url.origin
    } catch {
      problems.push('FRONTEND_ORIGIN must be a comma-separated list of origins such as https://scanner.example.com.')
      return origin
    }
  })
  if (frontendOrigins.length === 0) problems.push('FRONTEND_ORIGIN must list at least one origin.')

  const rawTrustProxy = env.TRUST_PROXY?.trim()
  let trustProxy: boolean | number | string = false
  if (rawTrustProxy) {
    trustProxy = /^\d+$/.test(rawTrustProxy)
      ? Number(rawTrustProxy)
      : rawTrustProxy === 'true'
        ? true
        : rawTrustProxy === 'false'
          ? false
          : rawTrustProxy
  }

  const logLevel = (env.LOG_LEVEL?.trim() || 'info') as AppConfig['logLevel']
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
    problems.push('LOG_LEVEL must be one of debug, info, warn, error, silent.')
  }

  const config: AppConfig = {
    isProduction,
    port: int(env, 'PORT', 3001, 1, 65535, problems),
    logLevel,
    frontendOrigins,
    trustProxy,
    lookupRateLimitPerMinute: int(env, 'LOOKUP_RATE_LIMIT_PER_MINUTE', 120, 1, 10000, problems),
    authorizeRequestHost: bool(env, 'AUTHORIZE_REQUEST_HOST', false, problems),
    erpnext,
    clerk: { publishableKey, secretKey, jwtKey: env.CLERK_JWT_KEY?.trim() || undefined },
    access: {
      allowedUserIds: list(env.ACCESS_ALLOWED_USER_IDS),
      deniedUserIds: list(env.ACCESS_DENIED_USER_IDS),
    },
  }

  if (problems.length > 0) throw new ConfigError(problems)
  return config
}
