/**
 * Minimal structured (JSON lines) logger.
 *
 * Never pass credentials, tokens, Authorization headers or prices to it. Callers log
 * identifiers and outcomes only.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

const LEVELS: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

export function createLogger(
  level: LogLevel | 'silent' = 'info',
  base: LogFields = {},
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const threshold = LEVELS[level]
  const emit = (lvl: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[lvl] < threshold) return
    write(JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...base, ...fields }))
  }
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }, write),
  }
}

export const silentLogger: Logger = createLogger('silent')
