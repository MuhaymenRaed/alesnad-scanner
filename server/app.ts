import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express, { type Express, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import type { ApiSuccess, HealthInfo, SessionInfo } from '../shared/api.js'
import { createAccessPolicy } from './auth/accessPolicy.js'
import { createAuthMiddleware } from './auth/clerkAuth.js'
import type { AppConfig } from './config.js'
import { createErpNextClient } from './erpnext/client.js'
import { createItemGroupScope } from './erpnext/itemGroups.js'
import { createPricingService } from './erpnext/pricing.js'
import { createProductLookupService } from './erpnext/productLookup.js'
import { createSchemaService } from './erpnext/schema.js'
import { AppError, createErrorHandler, sendError } from './http/errors.js'
import type { Logger } from './logger.js'
import { createItemsRouter } from './routes/items.js'

export interface AppDependencies {
  config: AppConfig
  logger: Logger
  /** Injected in tests to mock ERPNext; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  /** Injected in tests to make price validity deterministic. */
  today?: () => string
  /** Pre-load ERPNext metadata caches in the background (the server entry point enables this). */
  warmUp?: boolean
}

export function createApp({ config, logger, fetchImpl, today, warmUp = false }: AppDependencies): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  // Express 5's "simple" parser: repeated params become arrays, which validation rejects.
  app.set('query parser', 'simple')

  // --- ERPNext integration (server-side only) ---
  const client = createErpNextClient({
    baseUrl: config.erpnext.baseUrl,
    apiKey: config.erpnext.apiKey,
    apiSecret: config.erpnext.apiSecret,
    timeoutMs: config.erpnext.timeoutMs,
    fetchImpl,
  })
  const schema = createSchemaService(client, logger)
  const lookupService = createProductLookupService({
    client,
    schema,
    pricing: createPricingService({
      client,
      schema,
      logger,
      priceList: config.erpnext.priceList,
      allowBuyingPriceList: config.erpnext.allowBuyingPriceList,
      today,
    }),
    scope: createItemGroupScope(client, config.erpnext.itemGroups, logger),
    companyGroups: createItemGroupScope(client, config.erpnext.companyItemGroup ? [config.erpnext.companyItemGroup] : [], logger),
    config: config.erpnext,
    logger,
  })
  if (warmUp) {
    lookupService
      .warmUp()
      .then(() => logger.info('erpnext caches warmed up'))
      .catch((error: unknown) =>
        logger.warn('could not warm up erpnext caches (will retry on first scan)', {
          error: error instanceof Error ? error.message : 'unknown',
        }),
      )
  }

  // --- Cross-cutting middleware ---
  const requestContext: RequestHandler = (req, res, next) => {
    const requestId = randomUUID()
    const started = Date.now()
    res.locals.requestId = requestId
    res.setHeader('X-Request-Id', requestId)
    res.on('finish', () => {
      // Path only (no query string): no barcodes, tokens or other request data in access logs.
      logger.debug('request', { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started })
    })
    next()
  }

  app.use(requestContext)
  app.use(helmet())
  app.use(
    '/api',
    cors({
      origin: config.frontendOrigins,
      methods: ['GET'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  )

  // --- Public: health check (no auth, never touches ERPNext) ---
  app.get('/api/health', (_req, res) => {
    const body: ApiSuccess<HealthInfo> = { success: true, data: { status: 'ok', time: new Date().toISOString() } }
    res.json(body)
  })

  // --- Everything below requires a verified Clerk session + access policy ---
  const requireUser = createAuthMiddleware({
    clerk: config.clerk,
    authorizedParties: config.frontendOrigins,
    accessPolicy: createAccessPolicy(config.access),
    logger,
  })

  app.get('/api/session', ...requireUser, (_req, res) => {
    const body: ApiSuccess<SessionInfo> = { success: true, data: { userId: res.locals.userId as string, access: 'granted' } }
    res.setHeader('Cache-Control', 'no-store')
    res.json(body)
  })

  const lookupLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.lookupRateLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Runs after authentication, so limits are per verified user rather than per IP.
    keyGenerator: (_req, res) => `user:${String(res.locals.userId)}`,
    handler: (_req, res) => {
      sendError(res, new AppError('RATE_LIMITED', 429, 'Too many lookups in a short time. Wait a moment and try again.'))
    },
  })

  app.use('/api/items', ...requireUser, lookupLimiter, createItemsRouter(lookupService, logger))

  app.use('/api', (_req, res) => {
    sendError(res, new AppError('NOT_FOUND', 404, 'Unknown API endpoint.'))
  })

  app.use(createErrorHandler(logger))
  return app
}
