import type { ApiErrorCode } from '../../shared/api'

export type Tone = 'info' | 'success' | 'warning' | 'error'

export interface StatusCopy {
  title: string
  hint: string
  tone: Tone
}

/** User-facing wording for each error code: what happened and what to do next. */
const COPY: Partial<Record<ApiErrorCode, StatusCopy>> = {
  INVALID_BARCODE: { title: 'Check the barcode', hint: 'Scan again or type the code printed under the barcode.', tone: 'warning' },
  INVALID_ITEM_CODE: { title: 'That choice is not valid', hint: 'Scan the barcode again and pick one of the listed products.', tone: 'warning' },
  ITEM_NOT_FOUND: { title: 'Product not found', hint: 'No product in ERPNext has this barcode. Check the code or ask an administrator to add it to the item.', tone: 'warning' },
  ITEM_DISABLED: { title: 'Product is disabled', hint: 'This product is disabled in ERPNext and cannot be sold.', tone: 'warning' },
  ITEM_OUT_OF_SCOPE: { title: 'Not covered by this scanner', hint: 'This barcode belongs to a product outside the item groups this scanner is set up for.', tone: 'warning' },
  RATE_LIMITED: { title: 'Slow down a little', hint: 'Too many lookups in a short time. Wait a few seconds and scan again.', tone: 'warning' },
  UNAUTHENTICATED: { title: 'Session could not be verified', hint: 'Sign in again to continue scanning.', tone: 'error' },
  SESSION_ENDED: { title: 'Session ended', hint: 'Sign in again to continue scanning.', tone: 'error' },
  ACCESS_DENIED: { title: 'No access', hint: 'Your account is not allowed to use the product scanner. Ask an administrator for access.', tone: 'error' },
  ERPNEXT_AUTH_FAILED: { title: 'ERPNext connection problem', hint: 'The scanner cannot sign in to ERPNext. Ask an administrator to check the integration credentials.', tone: 'error' },
  ERPNEXT_PERMISSION_DENIED: { title: 'ERPNext permission problem', hint: 'The integration account cannot read this data. Ask an administrator to check its permissions.', tone: 'error' },
  ERPNEXT_TIMEOUT: { title: 'ERPNext is taking too long', hint: 'Try the scan again in a moment.', tone: 'error' },
  ERPNEXT_UNAVAILABLE: { title: 'ERPNext is unreachable', hint: 'Try again in a moment. If it keeps happening, tell an administrator.', tone: 'error' },
  ERPNEXT_ERROR: { title: 'ERPNext returned an error', hint: 'Try again. If it keeps happening, tell an administrator.', tone: 'error' },
  NETWORK_ERROR: { title: 'No connection to the scanner service', hint: 'Check your network connection and try again.', tone: 'error' },
}

export function statusCopy(code: ApiErrorCode, fallbackMessage: string): StatusCopy {
  return COPY[code] ?? { title: 'Something went wrong', hint: fallbackMessage || 'Try again.', tone: 'error' }
}
