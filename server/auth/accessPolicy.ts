/**
 * Authorization — separate from authentication.
 *
 * Authentication (Clerk) proves who the user is. This policy decides whether that verified user
 * may use the scanner. It only ever receives identifiers taken from a verified Clerk token,
 * never values supplied by the browser.
 *
 * Default (no configuration): every authenticated user is allowed.
 * Extension point: add role/organisation rules here (e.g. from verified token claims) without
 * touching the ERPNext integration.
 */

export interface VerifiedUser {
  userId: string
  orgId?: string | null
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: 'denied' | 'not_allowlisted' }

export interface AccessPolicy {
  readonly mode: 'all-authenticated-users' | 'allowlist'
  evaluate(user: VerifiedUser): AccessDecision
}

export function createAccessPolicy(config: { allowedUserIds: string[]; deniedUserIds: string[] }): AccessPolicy {
  const allowed = new Set(config.allowedUserIds)
  const denied = new Set(config.deniedUserIds)
  return {
    mode: allowed.size > 0 ? 'allowlist' : 'all-authenticated-users',
    evaluate(user) {
      if (denied.has(user.userId)) return { allowed: false, reason: 'denied' }
      if (allowed.size > 0 && !allowed.has(user.userId)) return { allowed: false, reason: 'not_allowlisted' }
      return { allowed: true }
    },
  }
}
