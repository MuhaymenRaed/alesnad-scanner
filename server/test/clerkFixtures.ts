import { generateKeyPairSync, sign } from 'node:crypto'

/**
 * Real RS256-signed Clerk-style session tokens for tests. The app is configured with the matching
 * public key as CLERK_JWT_KEY, so the OFFICIAL Clerk middleware verifies them locally — no network,
 * no real Clerk account and no real secrets.
 */

const FRONTEND_API = 'example.clerk.accounts.dev'

export const TEST_PUBLISHABLE_KEY = `pk_test_${Buffer.from(`${FRONTEND_API}$`).toString('base64')}`
export const TEST_SECRET_KEY = 'sk_test_not_a_real_secret_key_for_tests_only'
export const TEST_ORIGIN = 'http://localhost:5173'

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const otherKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

export const TEST_JWT_PUBLIC_KEY = keys.publicKey

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

export interface TokenOptions {
  userId?: string
  /** Seconds relative to now. */
  expiresIn?: number
  azp?: string
  /** Sign with an unrelated key (signature check must fail). */
  wrongKey?: boolean
  extraClaims?: Record<string, unknown>
}

export function signSessionToken(options: TokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000)
  // `cat` is the category Clerk stamps on real session tokens; the SDK rejects tokens without it.
  const header = { alg: 'RS256', typ: 'JWT', kid: 'ins_test', cat: 'cl_B7d4PD111AAA' }
  const payload = {
    iss: `https://${FRONTEND_API}`,
    sub: options.userId ?? 'user_test_1',
    sid: 'sess_test_1',
    azp: options.azp ?? TEST_ORIGIN,
    iat: now - 10,
    nbf: now - 10,
    exp: now + (options.expiresIn ?? 60),
    v: 2,
    ...options.extraClaims,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), options.wrongKey ? otherKeys.privateKey : keys.privateKey)
  return `${signingInput}.${b64url(signature)}`
}
