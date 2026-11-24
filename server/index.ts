import './loadEnv.js'
import { createApp } from './app.js'
import { ConfigError, loadAppConfig, type AppConfig } from './config.js'
import { createLogger } from './logger.js'

let config: AppConfig
try {
  config = loadAppConfig()
} catch (error) {
  if (error instanceof ConfigError) {
    // Names of the problem variables only — never their values.
    console.error(`${error.message}\n\nCopy .env.example to .env and fill in the missing values.`)
    process.exit(1)
  }
  throw error
}

const logger = createLogger(config.logLevel)
const app = createApp({ config, logger, warmUp: true })

const server = app.listen(config.port, () => {
  logger.info('scanner api listening', {
    port: config.port,
    erpnextHost: new URL(config.erpnext.baseUrl).host,
    priceList: config.erpnext.priceList,
    company: config.erpnext.company ?? '(all companies)',
    itemGroups: config.erpnext.itemGroups,
    matchItemCode: config.erpnext.matchItemCode,
    frontendOrigins: config.frontendOrigins,
    clerkInstance: config.clerk.secretKey.startsWith('sk_live_') ? 'production' : 'development',
    accessPolicy:
      config.access.allowedUserIds.length > 0 ? 'allowlist' : 'all-authenticated-users',
  })
})

function shutdown(signal: string) {
  logger.info('shutting down', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
