import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Only `VITE_*` variables are bundled into browser code. This guard fails the dev
 * server/build if a secret-looking value or name was accidentally given that prefix.
 */
function assertNoSecretsInClientEnv(env: Record<string, string>): void {
  const offenders = Object.entries(env)
    .filter(([name]) => name.startsWith('VITE_'))
    .filter(
      ([name, value]) =>
        /SECRET|PASSWORD|PRIVATE|API_KEY/i.test(name) ||
        value.startsWith('sk_') ||
        name.startsWith('VITE_ERPNEXT'),
    )
    .map(([name]) => name)

  if (offenders.length > 0) {
    throw new Error(
      `Refusing to expose secret-looking variables to the browser: ${offenders.join(', ')}. ` +
        'Secrets must not use the VITE_ prefix.',
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  assertNoSecretsInClientEnv(env)

  const apiTarget = `http://localhost:${env.PORT || '3001'}`

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      // Same-origin /api in development: the browser talks to Vite, Vite forwards to Express.
      proxy: { '/api': { target: apiTarget } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget } },
    },
    build: {
      sourcemap: false,
    },
  }
})
