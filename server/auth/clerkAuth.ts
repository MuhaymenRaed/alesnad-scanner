import { clerkMiddleware, createClerkClient, getAuth } from '@clerk/express'
import type { RequestHandler } from 'express'
import type { ClerkConfig } from '../config.js'
import { AppError, sendError } from '../http/errors.js'
import type { Logger } from '../logger.js'
import type { AccessPolicy } from './accessPolicy.js'

/**
 * Backend authentication for every ERPNext-backed endpoint:
 *
 *   requireBearerToken → clerkMiddleware (official SDK: verifies signature, exp/nbf/iat,
 *   authorized party) → stripClerkHeaders → requireSession → enforceAccessPolicy
 *
 * Only after all of these pass does a route handler (and therefore ERPNext) run.
 * - Missing/invalid/expired token → 401 UNAUTHENTICATED
 * - Valid user rejected by the access policy → 403 ACCESS_DENIED
 */

const UNAUTHENTICATED = () =>
  new AppError('UNAUTHENTICATED', 401, 'Your session is missing or has expired. Sign in again.')

export function createAuthMiddleware(options: {
  clerk: ClerkConfig
  /** Browser origins allowed to have issued the token (checked against the `azp` claim). */
  authorizedParties: string[]
  /**
   * Also accept tokens issued for `https://<request Host>`. Only safe where the platform routes
   * by Host so a request cannot claim a foreign one (e.g. Netlify: only the site's own domains
   * reach the function). Off by default.
   */
  authorizeRequestHost?: boolean
  accessPolicy: AccessPolicy
  logger: Logger
}): RequestHandler[] {
  const { clerk, accessPolicy, logger } = options

  const clerkClient = createClerkClient({
    secretKey: clerk.secretKey,
    publishableKey: clerk.publishableKey,
    ...(clerk.jwtKey ? { jwtKey: clerk.jwtKey } : {}),
  })

  // The API only accepts `Authorization: Bearer <Clerk session token>`. Cookies are ignored, so a
  // request is authenticated only when the app explicitly attached a fresh token.
  const requireBearerToken: RequestHandler = (req, res, next) => {
    const header = req.get('authorization') ?? ''
    if (!/^Bearer\s+\S+$/i.test(header)) {
      sendError(res, UNAUTHENTICATED())
      return
    }
    // Make sure Clerk only sees the header token.
    delete req.headers.cookie
    next()
  }

  const clerkOptions = {
    clerkClient,
    secretKey: clerk.secretKey,
    publishableKey: clerk.publishableKey,
    ...(clerk.jwtKey ? { jwtKey: clerk.jwtKey } : {}),
    authorizedParties: options.authorizedParties,
  }
  const verifyWithClerk = options.authorizeRequestHost
    ? clerkMiddleware((req) => {
        const host = req.get('host')
        return host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)
          ? { ...clerkOptions, authorizedParties: [...options.authorizedParties, `https://${host.toLowerCase()}`] }
          : clerkOptions
      })
    : clerkMiddleware(clerkOptions)

  // Clerk adds x-clerk-auth-status/-reason/-message debug headers; the message can contain token
  // verification details (e.g. expiry timestamps). Never send those to the client.
  const stripClerkHeaders: RequestHandler = (_req, res, next) => {
    for (const name of res.getHeaderNames()) {
      if (name.startsWith('x-clerk-')) res.removeHeader(name)
    }
    next()
  }

  const requireSession: RequestHandler = (req, res, next) => {
    const auth = getAuth(req)
    if (!auth.isAuthenticated || !auth.userId) {
      logger.info('rejected unauthenticated request', { requestId: res.locals.requestId, path: req.path })
      sendError(res, UNAUTHENTICATED())
      return
    }
    res.locals.userId = auth.userId
    res.locals.orgId = auth.orgId ?? null
    next()
  }

  const enforceAccessPolicy: RequestHandler = (req, res, next) => {
    const decision = accessPolicy.evaluate({ userId: res.locals.userId as string, orgId: res.locals.orgId as string | null })
    if (!decision.allowed) {
      logger.warn('access denied by policy', {
        requestId: res.locals.requestId,
        userId: res.locals.userId,
        reason: decision.reason,
        path: req.path,
      })
      sendError(res, new AppError('ACCESS_DENIED', 403, 'Your account is not allowed to use the product scanner. Ask an administrator for access.'))
      return
    }
    next()
  }

  return [requireBearerToken, verifyWithClerk, stripClerkHeaders, requireSession, enforceAccessPolicy]
}
