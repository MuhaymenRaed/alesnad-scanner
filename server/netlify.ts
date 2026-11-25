import serverless from 'serverless-http'
import { createApp } from './app.js'
import { ConfigError, loadAppConfig } from './config.js'
import { createLogger } from './logger.js'

/**
 * Netlify Function adapter: the same Express app that `npm start` runs, wrapped for AWS-Lambda
 * style invocation. `netlify.toml` rewrites `/api/*` to this function, so the browser keeps
 * calling same-origin `/api/...` exactly as in development.
 *
 * Platform adjustments (all non-secret):
 *  - The site's own Netlify URLs (URL / DEPLOY_PRIME_URL) are added to FRONTEND_ORIGIN, so CORS and
 *    Clerk's authorized-party (azp) check accept the deployed site without extra setup.
 *  - Netlify sits in front of the function as a proxy → TRUST_PROXY defaults to 1.
 *  - Synchronous Netlify Functions stop after 10 s, so the ERPNext timeout is capped at 8 s to
 *    answer with a clean ERPNEXT_TIMEOUT instead of being cut off mid-request.
 */

const NETLIFY_FUNCTION_LIMIT_MS = 8000

type Env = Record<string, string | undefined>
type Handler = ReturnType<typeof serverless>

export function netlifyEnv(source: Env): Env {
  const env: Env = { ...source }
  const origins = [env.FRONTEND_ORIGIN, env.URL, env.DEPLOY_PRIME_URL]
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  env.FRONTEND_ORIGIN = [...new Set(origins)].join(',') || undefined
  env.TRUST_PROXY ??= '1'
  // Netlify only routes the site's own domains to this function, so the request Host is the site.
  env.AUTHORIZE_REQUEST_HOST ??= 'true'
  const timeout = Number(env.ERPNEXT_TIMEOUT_MS ?? '10000')
  if (!Number.isFinite(timeout) || timeout > NETLIFY_FUNCTION_LIMIT_MS) env.ERPNEXT_TIMEOUT_MS = String(NETLIFY_FUNCTION_LIMIT_MS)
  return env
}

export function createNetlifyHandler(source: Env = process.env, fetchImpl?: typeof fetch): Handler {
  const logger = createLogger((source.LOG_LEVEL as 'info' | undefined) ?? 'info', { runtime: 'netlify' })
  try {
    const config = loadAppConfig(netlifyEnv(source))
    return serverless(createApp({ config, logger, fetchImpl }), {
      // Product images are binary and must be base64-encoded for the function response.
      binary: ['image/*'],
      request(request: { url?: string }) {
        // Depending on how the function is reached the path is /api/... or /.netlify/functions/api/...
        if (request.url) request.url = request.url.replace(/^\/\.netlify\/functions\/api(?=\/|\?|$)/, '/api')
      },
    })
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    // Variable NAMES only — never values.
    logger.error('scanner api is not configured', { problems: error.problems })
    const body = JSON.stringify({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'The scanner service is not configured yet. Ask an administrator.' },
    })
    return async () => ({ statusCode: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body })
  }
}

let instance: Handler | undefined

/** Netlify entry point (loaded by netlify/functions/api.cjs). Built once per warm instance. */
export const handler: Handler = (event, context) => {
  instance ??= createNetlifyHandler()
  return instance(event, context)
}
