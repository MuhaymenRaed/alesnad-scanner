import type { ErrorRequestHandler, Response } from 'express'
import type { AmbiguousCandidate, ApiErrorCode, ApiFailure } from '../../shared/api.js'
import { ErpNextError } from '../erpnext/client.js'
import type { Logger } from '../logger.js'

/** An error that is safe to show to the browser: fixed code, status and user-facing message. */
export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly candidates?: AmbiguousCandidate[]

  constructor(code: ApiErrorCode, status: number, message: string, candidates?: AmbiguousCandidate[]) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.candidates = candidates
  }
}

export function sendError(res: Response, error: AppError): void {
  const body: ApiFailure = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined,
      ...(error.candidates ? { candidates: error.candidates } : {}),
    },
  }
  res.status(error.status).json(body)
}

/**
 * Translate ERPNext failures into browser-safe errors. ERPNext auth/permission problems are
 * the server's integration account, not the signed-in user, so they are 502 — never 401/403,
 * which the frontend reserves for the user's own Clerk session.
 */
export function fromErpNextError(error: ErpNextError): AppError {
  switch (error.kind) {
    case 'auth':
      return new AppError(
        'ERPNEXT_AUTH_FAILED',
        502,
        'The scanner service could not sign in to ERPNext. Ask an administrator to check the integration credentials.',
      )
    case 'permission':
      return new AppError(
        'ERPNEXT_PERMISSION_DENIED',
        502,
        'The ERPNext integration account is not allowed to read this data. Ask an administrator to check its permissions.',
      )
    case 'timeout':
      return new AppError('ERPNEXT_TIMEOUT', 504, 'ERPNext took too long to respond. Try again in a moment.')
    case 'unavailable':
      return new AppError('ERPNEXT_UNAVAILABLE', 502, 'ERPNext is unreachable right now. Try again in a moment.')
    default:
      return new AppError('ERPNEXT_ERROR', 502, 'ERPNext returned an unexpected error. Try again or contact an administrator.')
  }
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    const requestId = res.locals.requestId as string | undefined
    if (err instanceof AppError) {
      sendError(res, err)
      return
    }
    if (err instanceof ErpNextError) {
      logger.warn('erpnext request failed', { requestId, kind: err.kind, upstreamStatus: err.status, path: req.path })
      sendError(res, fromErpNextError(err))
      return
    }
    // Log the error type and message only — never request headers (they carry tokens).
    logger.error('unhandled error', {
      requestId,
      path: req.path,
      error: err instanceof Error ? `${err.name}: ${err.message}` : 'non-error thrown',
    })
    sendError(res, new AppError('INTERNAL_ERROR', 500, 'Something went wrong on the server. Try again.'))
  }
}
