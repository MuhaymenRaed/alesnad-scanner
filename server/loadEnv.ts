import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads ./.env into process.env (variables already set in the environment win).
 * Imported first by every entry point so that configuration is in place before other modules load.
 */
const envFile = resolve(process.cwd(), '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
