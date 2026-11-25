// Netlify Function: the scanner's backend (/api/*). The TypeScript source is server/netlify.ts;
// Netlify's build runs `npm run build:netlify`, which compiles it to dist-server/ first.
export { handler } from '../../dist-server/server/netlify.js'
