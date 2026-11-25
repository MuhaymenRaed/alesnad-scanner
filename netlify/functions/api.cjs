// Netlify Function: the scanner's backend (/api/*).
//
// CommonJS on purpose: Netlify's function runtime loads every function with require(), and the
// Node versions it runs functions on cannot require() an ES module (ERR_REQUIRE_ESM). The server
// itself is ESM (compiled from server/netlify.ts by `npm run build:netlify`), so it is loaded with
// a dynamic import() — supported by every Node version — once per warm instance.
let handlerPromise

exports.handler = async (event, context) => {
  handlerPromise ??= import('../../dist-server/server/netlify.js').then((module) => module.handler)
  const handler = await handlerPromise
  return handler(event, context)
}
