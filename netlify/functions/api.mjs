// Netlify Function (v2 API): the scanner's backend for /api/*.
//
// v2 functions are loaded by Netlify's ES-module runtime, which matches this project's
// "type": "module". (The v1 handler format went through a CommonJS wrapper that broke on it.)
// The server is compiled from server/netlify.ts to dist-server/ by `npm run build:netlify`.
import { handleRequest } from '../../dist-server/server/netlify.js'

export default (request) => handleRequest(request)

// Serves /api/* directly. Function paths are matched before the SPA fallback rewrite in netlify.toml.
export const config = { path: '/api/*' }
