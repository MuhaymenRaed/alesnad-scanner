# Al Isnad Product Scanner · ماسح الاسناد

A barcode-scanning web app for retail counters and warehouses. Scan a product with a USB or
Bluetooth scanner, or a phone camera. The app finds the exact matching Item in ERPNext and shows
its name, item code, barcode, selling price with currency, unit and other approved details.

- **Read-only.** The app never creates, updates or deletes anything in ERPNext.
- **Staff only.** Users sign in with [Clerk](https://clerk.com). The backend verifies a Clerk session token on every data request.
- **Secrets stay on the server.** ERPNext and Clerk secret keys never reach the browser.

## Contents

1. [Technology](#technology)
2. [Project structure](#project-structure)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [Clerk setup](#clerk-setup)
6. [ERPNext setup](#erpnext-setup)
7. [How barcode matching works](#how-barcode-matching-works)
8. [How the selling price is chosen](#how-the-selling-price-is-chosen)
9. [Using the scanner](#using-the-scanner)
10. [Authentication and authorization](#authentication-and-authorization)
11. [API](#api)
12. [Testing](#testing)
13. [Building and deploying](#building-and-deploying)
14. [Troubleshooting](#troubleshooting)

## Technology

| Area | Stack |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, React Router 8, `@clerk/react`, `@zxing/browser`, Lucide icons |
| Backend | Node.js 22+ and Express 5 in TypeScript, `@clerk/express`, `helmet`, `cors`, `express-rate-limit`; native `fetch` for ERPNext |
| Tests | Vitest, Testing Library, Supertest. ERPNext and Clerk are mocked, so tests need no live services. |
| Tooling | oxlint, `tsc`, `tsx` (development server runner) |

## Project structure

```
shared/                 API contract types + barcode validation (used by both sides)
server/
  index.ts              entry point: loads .env, validates config, starts Express
  app.ts                app factory: middleware, routes, wiring
  config.ts             environment validation (names problems, never prints values)
  auth/
    clerkAuth.ts        Bearer token → Clerk verification → session → access policy
    accessPolicy.ts     authorization rules (allow/deny lists; extension point)
  erpnext/
    client.ts           read-only Frappe REST client (GET only, timeouts, error mapping)
    schema.ts           discovers the live Item / Item Barcode / Item Price schema
    productLookup.ts    barcode → Item matching, ambiguity handling, images
    pricing.ts          selling-price selection rules
    normalize.ts        Item → API object, metadata allowlist, HTML → text
    itemGroups.ts       optional item-group scope (sub-groups included)
  routes/items.ts       GET /api/items/lookup, GET /api/items/image
  http/errors.ts        safe error responses
  scripts/checkErpnext.ts   `npm run check:erpnext` diagnostic
  test/                 fake ERPNext + Clerk token fixtures
src/
  main.tsx, App.tsx     ClerkProvider + router + routes
  auth/                 custom Clerk sign-in/sign-up (SignInForm, SignUpForm, AuthShell),
                        ProtectedRoute, AccessGate, safe redirects
  pages/                SignInPage (+ SignUpPage), ScannerPage
  components/           AppHeader, BarcodeInput, CameraScanner, ProductDetails, PriceDisplay,
                        RecentScans, StatusMessage, AmbiguousMatches, …
  hooks/                useProductLookup (lookup state machine), useApiClient, useProductImage
  lib/                  api client, formatting, user-facing messages
```

## Quick start

Prerequisites: **Node.js 22.12 or newer** with npm, an ERPNext v14/v15 site, and a Clerk account.

```bash
npm install
cp .env.example .env          # then fill in the values (see Configuration)
npm run check:erpnext          # optional: verify the ERPNext connection and settings
npm run dev                    # starts the API (port 3001) and Vite (port 5173) together
```

Open <http://localhost:5173>, sign in, and scan a barcode.

You can also run the two halves separately: `npm run dev:server` and `npm run dev:client`. In
development Vite forwards `/api/*` to the backend, so the browser only ever talks to one origin.

## Configuration

All configuration lives in `.env`. `.env.example` documents every variable. `.env` and `.env.*`
are gitignored; only `.env.example` is committed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ERPNEXT_BASE_URL` | yes | ERPNext site URL. Must be `https://` in production. Server-side, so changing it needs no frontend rebuild. |
| `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` | yes | Credentials of the read-only integration user. Server-side only. |
| `ERPNEXT_PRICE_LIST` | no (`Standard Selling`) | The selling price list prices are read from. |
| `ERPNEXT_ALLOW_BUYING_PRICE_LIST` | no (`false`) | Allows a price list that is also flagged *Buying*. |
| `ERPNEXT_TIMEOUT_MS` | no (`10000`) | Timeout for each request to ERPNext. |
| `ERPNEXT_COMPANY` | no (recommended) | Only Items of this company can be looked up — an Item belongs to it when **Item → Item Defaults** has a row for the company. Other companies’ Items are never read, priced or imaged, and are reported exactly like a barcode that does not exist. |
| `ERPNEXT_COMPANY_ITEM_GROUP` | no (company name) | Items with **no Item Defaults at all** (typically newly created ones) also count as the company’s when their item group is inside this group tree (sub-groups included). Items whose defaults name another company never do. `none` disables this and requires an Item Default. |
| `ERPNEXT_ITEM_GROUPS` | no | Comma-separated item groups (sub-groups included). Items outside them return `ITEM_OUT_OF_SCOPE`. |
| `ITEM_METADATA_FIELDS` | no | Extra Item fields for the details panel, including custom fields such as `custom_device_color`. |
| `DISABLED_ITEM_POLICY` | no (`warn`) | `warn` shows disabled Items with a prominent warning. `reject` treats them as `ITEM_DISABLED` (404). |
| `LOOKUP_MATCH_ITEM_CODE` | no (`false`) | If no barcode matches, also try an exact Item Code match. Off by default because a barcode is not an Item Code. |
| `PORT` | no (`3001`) | Backend port. |
| `FRONTEND_ORIGIN` | no (`http://localhost:5173`) | Allowed browser origin(s), comma-separated. Used for CORS and for Clerk's `azp` check. |
| `TRUST_PROXY` | no | Set to `1` (or a proxy address) behind a reverse proxy. |
| `LOOKUP_RATE_LIMIT_PER_MINUTE` | no (`120`) | Per signed-in user. |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key. Public; used by the browser, and by the backend unless `CLERK_PUBLISHABLE_KEY` is set. |
| `CLERK_SECRET_KEY` | yes | Clerk secret key. **Server-side only.** |
| `CLERK_JWT_KEY` | no | Clerk JWKS public key (PEM) for verifying tokens without a network call. |
| `ACCESS_ALLOWED_USER_IDS`, `ACCESS_DENIED_USER_IDS` | no | Optional access policy using Clerk user IDs. |
| `VITE_ENABLE_SIGN_UP` | no (`false`) | Shows the custom sign-up page. Leave off for invite-only staff accounts. |
| `VITE_API_BASE_URL` | no | Only needed if the API is on a different origin from the frontend. |
| `LOG_LEVEL` | no (`info`) | `debug` / `info` / `warn` / `error` / `silent`. |

The backend validates its configuration at startup and lists every missing or invalid variable by
name. It never prints the values.

## Clerk setup

1. **Create an application.** In the [Clerk Dashboard](https://dashboard.clerk.com), create an application.
2. **Choose sign-in methods.** Under **User & authentication**, enable **Email address** with **Password** and/or **Email verification code**. The sign-in screen is the app's own design, built on Clerk's headless `useSignIn()` API, so no Clerk component or badge is rendered anywhere. It supports e-mail + password, e-mailed sign-in codes, forgotten passwords, new-device verification, and two-step verification (authenticator app, SMS, e-mail code or backup code). Social logins (Google, …) are not wired into the custom screen.
3. **Restrict who can register** (recommended). The app's sign-up page is off unless `VITE_ENABLE_SIGN_UP=true`. Under **Configure → Restrictions**, set the sign-up mode to **Restricted**, then invite staff from **Users → Invite**. Anyone who manages to sign up would otherwise count as an authenticated user; for an extra lock see [Authentication and authorization](#authentication-and-authorization).
4. **Copy the keys.** Under **API keys**, copy the *Publishable key* into `VITE_CLERK_PUBLISHABLE_KEY` and the *Secret key* into `CLERK_SECRET_KEY`. Development instances use `pk_test_`/`sk_test_` keys and work on `localhost` without further setup.
5. **Production.** Create a production instance, add your domain under **Domains** and complete the DNS records, then use the `pk_live_`/`sk_live_` keys. Set `FRONTEND_ORIGIN` to your public `https://` URL. The backend refuses test keys when `NODE_ENV=production`.

References: [Clerk React](https://clerk.com/docs/react/overview), the
[React quickstart](https://clerk.com/docs/quickstarts/react), and
[manual JWT verification](https://clerk.com/docs/backend-requests/handling/manual-jwt).

## ERPNext setup

### Integration user and permissions

Use a dedicated user, not Administrator and not a person's own account:

1. Create a **User**, for example `scanner-integration@yourcompany.com`, with no desk roles.
2. Create a **Role**, for example *Scanner Integration*, and give it **Read** only (no Write, Create, Delete, Submit, Export or Report) on:

   | DocType | Why |
   | --- | --- |
   | **Item** | Product data and its Item Barcode child table, which is read through the Item permission. |
   | **Item Price** | Selling prices. |
   | **Price List** | Optional. Lets the app confirm the list is enabled, selling and not buying. Without it the app relies on each Item Price's selling/buying flags. |
   | **Item Group** | Only needed with `ERPNEXT_ITEM_GROUPS`, to include sub-groups. Without it, only exact group names match. |

3. Assign the role to the user, and add User Permissions if the user should only see some Items.
4. Generate API credentials: open the user, then **Settings → API Access → Generate Keys**. Copy the API key and secret into `.env`.

The app also reads DocType metadata through `frappe.desk.form.load.getdoctype`, the same read-only
call the ERPNext desk uses, to discover field names and labels. If that is not allowed, the app
falls back to the standard ERPNext v14/v15 schema.

Requests use Frappe token authentication, `Authorization: token <key>:<secret>`, and only GET
endpoints. See the official docs:
[REST API](https://docs.frappe.io/framework/user/en/api/rest),
[REST integration guide](https://docs.frappe.io/framework/user/en/guides/integration/rest_api), and
[Item](https://docs.frappe.io/erpnext/item).

Check everything with:

```bash
npm run check:erpnext                # connection, schema, barcode count, price list, item-group scope
npm run check:erpnext -- 0123456789  # plus a full lookup, exactly as the API would do it
```

## How barcode matching works

1. The scanned value is treated as a **string**. Only surrounding whitespace is trimmed, so leading zeros and inner characters are kept. It is never converted to a number. Values that are empty, longer than 140 characters or contain control characters are rejected with `INVALID_BARCODE`.
2. The backend finds the barcode child table by inspecting Item metadata (standard: `Item.barcodes → Item Barcode`). It then runs an exact query: `GET /api/resource/Item Barcode?parent=Item&filters=[["barcode","=",…],["parenttype","=","Item"]]`, with every parameter URL-encoded.
3. Results are re-checked with **strict string equality**. MariaDB's default collation ignores case and trailing spaces, so the database alone would match `abc` to `ABC `.
4. Matching rows are grouped by parent Item:
   - **No Item:** `404 ITEM_NOT_FOUND`.
   - **One Item:** that Item is read with `GET /api/resource/Item/{name}`.
   - **Several Items:** `409 AMBIGUOUS_BARCODE` with the candidates (code, name, group, disabled). The app never picks one silently. The user chooses, and the server re-runs the match and accepts the choice only if it is one of the exact matches.
5. **Company scope.** With `ERPNEXT_COMPANY`, the barcode query runs in parallel with an Item query filtered on `Item Default.company`, and only Items in both are kept, before any Item is read in detail. The Item document is checked again (defence in depth). Items without any Item Defaults count as the company’s when their group is inside `ERPNEXT_COMPANY_ITEM_GROUP` (default: the group named like the company). Items of other companies, or outside both rules, return the same `ITEM_NOT_FOUND` as an unknown barcode; the item-code match and the image endpoint use the same filter.
6. Disabled Items follow `DISABLED_ITEM_POLICY`. Items outside `ERPNEXT_ITEM_GROUPS` return `ITEM_OUT_OF_SCOPE`.
7. With `LOOKUP_MATCH_ITEM_CODE=true`, an exact Item Code match is tried when no barcode matches, and the result is labelled "Matched by item code".

Only allowlisted fields are returned. Cost, valuation, supplier, accounting and similar fields are
always blocked, even if listed in `ITEM_METADATA_FIELDS`. HTML descriptions are converted to plain
text on the server, and product images are proxied through the authenticated backend. Only image
files hosted on the ERPNext site are served, raster formats only, up to 5 MB.

## How the selling price is chosen

Only `Item Price` records are used. `standard_rate`, valuation rate and purchase prices are never
used. A record is eligible when all of these hold:

1. Its `item_code` is the matched Item and its `price_list` is exactly `ERPNEXT_PRICE_LIST`. There is **no fallback** to any other price list.
2. It is a selling price (`selling = 1`). If the record or the Price List is also a buying list, the price is withheld, because such lists usually hold purchase costs. `ERPNEXT_ALLOW_BUYING_PRICE_LIST=true` overrides this.
3. The Price List is enabled, when the app is allowed to read it.
4. It is a general price: no customer, supplier or batch.
5. It is valid today: `valid_from ≤ today ≤ valid_upto`, where empty bounds are open. "Today" uses the server time zone, so set `TZ` to ERPNext's time zone (for example `TZ=Asia/Baghdad`).
6. It has a numeric rate and a currency.

**Unit:** the requested unit is the barcode's UOM if set, otherwise the Item's sales UOM, otherwise
its stock UOM. A price for that unit wins, and a blank-UOM price counts as the stock unit. If there
is no price for the requested unit, the stock-unit price is shown and clearly labelled ("this
barcode is for Box, the price is per Nos"). No conversion maths is applied.

**Ties are broken deterministically:** latest `valid_from` first (undated last), then explicit UOM
before blank, then most recently modified, then record name. This mirrors ERPNext's own
`get_item_price` ordering.

When no price applies, the product is still returned with `price.status = "unavailable"` and a
reason, and `sellingPrice: null`. The app shows **"No price available"**, never 0. A genuine price
of 0 in ERPNext is shown as 0. The price is stored as a number and formatted with the currency's
standard decimals. No symbol is hard-coded, and the currency code and price list are always shown.

Pricing lives in `server/erpnext/pricing.ts`. `selectSellingPrice` is a pure function, so
customer-specific or UOM-conversion pricing can be added there without touching the scanner.

## Using the scanner

**USB or Bluetooth scanners.** These act as keyboards: the scanner types the code and presses
Enter. The barcode field is focused automatically and re-focused after each lookup, and keystrokes
that arrive while nothing is focused are redirected into it. You can scan product after product
without touching the mouse. Only Enter or the Search button triggers a lookup, never individual
keystrokes. A duplicate Enter, such as a CR+LF from the scanner, is ignored, and a newer scan always
replaces an older pending one. Configure the scanner to send Enter as its suffix (most do by
default). Typing and pasting work too.

**Camera.** Press **Camera** and allow camera access. The rear camera is preferred on phones.
Supported formats are EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and QR. Scanning pauses while a
lookup runs, and a barcode that stays in view is not looked up again until it has left the frame.
The camera is released when you close it or leave the page. The camera needs HTTPS (or `localhost`).
The decoder is only downloaded when the camera is opened.

**Recent scans** lists this session's scans, including failures. Click one to review its result.
The list lives in memory only: it is cleared on reload or sign-out and never stored.

## Authentication and authorization

**Frontend.** Every route except `/sign-in` is wrapped in `ProtectedRoute`:

- While Clerk resolves the session, a loading screen is shown and protected content never renders.
- Signed-out users are redirected to `/sign-in?redirect_url=<where they were going>`, and returned there after signing in. Only same-origin paths are accepted.
- Signed-in users who open `/sign-in` are sent to the scanner.
- Sign-out (header button or Clerk's user menu) ends the session and returns to `/sign-in`.

The scanner then calls `GET /api/session` (`AccessGate`), so the server confirms access before the
scanner appears.

**Backend.** This is mandatory, because route guards in React are only UX: anyone can call the API
with curl. Every ERPNext-backed endpoint runs this chain before any ERPNext request:

1. A `Authorization: Bearer <Clerk session token>` header is required. Cookies are ignored.
2. The official `@clerk/express` middleware verifies the token: signature, expiry and not-before (with clock-skew tolerance), and that the token was issued for one of `FRONTEND_ORIGIN` (`azp`, authorized parties). The app never decodes or trusts claims itself.
3. A missing, malformed, forged, expired or wrong-origin token gets `401 UNAUTHENTICATED` with a generic message. Clerk's `x-clerk-auth-*` debug headers are stripped so verification details never reach the client.
4. The access policy (`server/auth/accessPolicy.ts`) runs. By default every authenticated user is allowed. `ACCESS_ALLOWED_USER_IDS` and `ACCESS_DENIED_USER_IDS` restrict access by verified Clerk user ID. A failure gets `403 ACCESS_DENIED`. Role- or organisation-based rules can be added there later.

The frontend gets a fresh token from Clerk (`getToken()`) for each request. On a 401 it retries once
with `getToken({ skipCache: true })`. If Clerk has no session any more, the user is signed out and
sent to sign-in. If the server still rejects a fresh token, a "Sign in again" action is shown.

Clerk authentication does not replace ERPNext authentication. The backend uses Clerk only to decide
who may use the app, and its own restricted integration user to read ERPNext.

**Checking that unauthenticated access is blocked:**

```bash
curl -i "http://localhost:3001/api/items/lookup?barcode=0123456789012"
# HTTP/1.1 401 Unauthorized  {"success":false,"error":{"code":"UNAUTHENTICATED",…}}
```

No ERPNext request is made for this, which the automated tests assert.

## API

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/health` | public | `{ success: true, data: { status: "ok" } }`. Never touches ERPNext. |
| `GET /api/session` | Clerk + policy | Confirms the signed-in user may use the scanner. |
| `GET /api/items/lookup?barcode=…[&itemCode=…]` | Clerk + policy | Product lookup. `itemCode` resolves an ambiguous barcode. |
| `GET /api/items/image?itemCode=…` | Clerk + policy | Product image proxied from ERPNext. |

A successful lookup returns `{ "success": true, "data": Product }`; see `shared/api.ts` for the full
type. Key fields are `itemCode`, `itemName`, `barcode`, `barcodeType`, `uom`, `sellingPrice`,
`currency`, `priceList`, `price` (`available` or `unavailable` with a reason), `description`,
`itemGroup`, `brand`, `hasImage` and `metadata`.

Errors look like `{ "success": false, "error": { "code", "message", "requestId" } }`.

| Status | Codes |
| --- | --- |
| 400 | `INVALID_BARCODE`, `INVALID_ITEM_CODE` |
| 401 | `UNAUTHENTICATED` |
| 403 | `ACCESS_DENIED` |
| 404 | `ITEM_NOT_FOUND`, `ITEM_DISABLED`, `ITEM_OUT_OF_SCOPE`, `IMAGE_NOT_AVAILABLE` |
| 409 | `AMBIGUOUS_BARCODE` (with `candidates`) |
| 429 | `RATE_LIMITED` |
| 502 | `ERPNEXT_AUTH_FAILED`, `ERPNEXT_PERMISSION_DENIED`, `ERPNEXT_UNAVAILABLE`, `ERPNEXT_ERROR` |
| 504 | `ERPNEXT_TIMEOUT` |
| 500 | `INTERNAL_ERROR` |

ERPNext credential or permission problems are reported as 502, never 401/403. Those two statuses
are reserved for the user's own session, so the frontend never signs a user out because of a server
misconfiguration. There is no generic proxy: the browser cannot choose a DocType, URL or field.

## Testing

```bash
npm test             # all tests (backend + frontend)
npm run typecheck    # strict TypeScript for frontend, backend and configs
npm run lint         # oxlint
```

- **Backend** (`server/**/*.test.ts`). Covers lookup, exact and case-sensitive matching, leading zeros, input validation, not found, ambiguous matches and server-side validation of the user's choice, normalization and field blocking, price selection rules, missing, zero and buying-list prices, no price-list fallback, item-group scope, disabled items, timeouts, network failures and ERPNext 401/403/5xx, rate limiting, and image safety.
  - **Clerk in tests.** The real Clerk middleware verifies RS256 tokens signed by a test key (supplied as `CLERK_JWT_KEY`). Valid, expired, forged, tampered, wrong-origin and malformed tokens are all exercised, as are allow/deny policies, and the tests assert that rejected requests never reach ERPNext.
  - **ERPNext in tests.** It is an in-memory fake with MariaDB-like collation behaviour.
- **Frontend** (`src/**/*.test.tsx`). Covers route protection (loading, redirect with destination, already signed in, sign-out), open-redirect protection, token refresh and retry on 401, ended sessions, stale-response protection, duplicate-scan prevention, and the UI states: loading, found, no price, not found, ERPNext errors, ambiguous choice, and keyboard focus redirection.

No test needs live ERPNext or Clerk credentials.

## Building and deploying

```bash
npm run build      # typecheck, then frontend → dist/, backend → dist-server/
NODE_ENV=production npm start        # runs dist-server/server/index.js
```

The usual layout is one public HTTPS origin behind a reverse proxy: the proxy serves `dist/` as
static files and forwards `/api/*` to the Node backend. Example Caddyfile:

```
scanner.example.com {
  handle /api/* {
    reverse_proxy 127.0.0.1:3001
  }
  handle {
    root * /srv/al-esnad-scanner/dist
    try_files {path} /index.html
    file_server
  }
}
```

Production checklist:

- `NODE_ENV=production`. Production requires `https://` for ERPNext and `FRONTEND_ORIGIN`, and Clerk live keys.
- `FRONTEND_ORIGIN=https://scanner.example.com`, which must exactly match the URL users open.
- `TRUST_PROXY=1` when behind one proxy hop, and `TZ` set to the ERPNext time zone.
- Build the frontend with the **live** `VITE_CLERK_PUBLISHABLE_KEY`; it is baked into `dist/` at build time.
- Add the production domain in Clerk; restrict sign-ups.
- If the API is on a different origin, build with `VITE_API_BASE_URL=https://api.example.com` and list the frontend origin in `FRONTEND_ORIGIN` (CORS).
- Keep `.env` out of version control and give the ERPNext integration user read-only permissions.

### Netlify (one site: static app + API function)

`netlify.toml` is ready. The site serves `dist/`, `/api/*` is rewritten to the Netlify Function
`netlify/functions/api.mjs` (the same Express app, compiled from `server/netlify.ts`), and every other
path falls back to `index.html`. Build command: `npm run build:netlify` (typecheck → Vite → tsc).

In **Site configuration → Environment variables** (scope: Builds + Functions) set:

| Variable | Value |
| --- | --- |
| `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` | as in `.env` |
| `ERPNEXT_COMPANY` | `الاسناد` |
| `ERPNEXT_PRICE_LIST` / `ERPNEXT_ALLOW_BUYING_PRICE_LIST` | `الاسناد` / `true` |
| `ITEM_METADATA_FIELDS`, `LOOKUP_MATCH_ITEM_CODE`, `DISABLED_ITEM_POLICY` | as in `.env` |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | your Clerk keys |
| `FRONTEND_ORIGIN` | your site URL, e.g. `https://alesnad-scanner.netlify.app` (the site's Netlify URLs are also added automatically) |

Not needed on Netlify: `PORT`. `ERPNEXT_TIMEOUT_MS` is capped at 8 s because Netlify functions stop
after 10 s. Netlify's secret scanner is told which variables are plain settings
(`SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`); the API secret and Clerk secret key are still scanned.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| "Sign-in is not configured" | `VITE_CLERK_PUBLISHABLE_KEY` is missing. Restart `npm run dev` after editing `.env`. |
| Backend exits with "Invalid configuration" | The message lists the missing or invalid variables. |
| Sign-in page doesn't load | The publishable key is wrong, or the network blocks `*.clerk.accounts.dev` (or your Clerk domain). |
| Signed in, but "session could not be verified" or 401 from the API | `CLERK_SECRET_KEY` belongs to a different Clerk instance than the publishable key; `FRONTEND_ORIGIN` doesn't exactly match the browser origin (scheme, host and port), which fails the `azp` check; or the server clock is wrong. |
| Redirect loop or wrong page after sign-in | Make sure the frontend is served at the root and `/sign-in/*` falls back to `index.html` (SPA fallback). |
| CORS errors | Only when the API is on another origin: add the exact frontend origin to `FRONTEND_ORIGIN`. Same-origin setups (dev proxy, reverse proxy) need no CORS. |
| "Product not found" for every scan | The Items have no barcodes. Add them in ERPNext (Item → Barcodes) and confirm with `npm run check:erpnext`, which reports how many Items have barcodes. |
| "ERPNext connection problem" (`ERPNEXT_AUTH_FAILED`) | Wrong API key or secret, or the integration user is disabled. |
| "ERPNext permission problem" | Give the integration role read access to Item and Item Price (see the table above). |
| "No price available" | No valid general selling price exists for that Item and unit in `ERPNEXT_PRICE_LIST`. Check validity dates, customer/batch-specific prices, the UOM, and whether the list is enabled, selling and not buying. The reason shown under the price says which. |
| ERPNext is slow or times out | Increase `ERPNEXT_TIMEOUT_MS`. Host the backend close to ERPNext. |
| Camera: "permission denied" | Allow the camera in the browser's site settings and reopen the camera. |
| Camera: "unavailable" | Open the app over HTTPS (or `localhost`); browsers block cameras on plain HTTP. |
| Camera: "busy" | Close other apps or tabs using the camera. |
