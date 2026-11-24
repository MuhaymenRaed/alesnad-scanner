/**
 * Frontend ⇄ backend API contract. Shared by the React app and the Express server so both
 * sides agree on the exact shape of every response.
 */

export type ApiErrorCode =
  | 'INVALID_BARCODE'
  | 'INVALID_ITEM_CODE'
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_DISABLED'
  | 'ITEM_OUT_OF_SCOPE'
  | 'AMBIGUOUS_BARCODE'
  | 'IMAGE_NOT_AVAILABLE'
  | 'RATE_LIMITED'
  | 'ERPNEXT_AUTH_FAILED'
  | 'ERPNEXT_PERMISSION_DENIED'
  | 'ERPNEXT_UNAVAILABLE'
  | 'ERPNEXT_TIMEOUT'
  | 'ERPNEXT_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  // Client-side only codes (never sent by the server):
  | 'NETWORK_ERROR'
  | 'BAD_RESPONSE'
  | 'SESSION_ENDED'

/** One candidate shown to the user when a barcode matches several Items. */
export interface AmbiguousCandidate {
  itemCode: string
  itemName: string
  itemGroup: string | null
  disabled: boolean
}

export interface ApiError {
  code: ApiErrorCode
  message: string
  requestId?: string
  /** Present only for AMBIGUOUS_BARCODE. */
  candidates?: AmbiguousCandidate[]
}

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiFailure {
  success: false
  error: ApiError
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export type PriceUnavailableReason =
  | 'NO_PRICE_IN_LIST'
  | 'NO_VALID_PRICE'
  | 'NO_PRICE_FOR_UOM'
  | 'PRICE_LIST_NOT_FOUND'
  | 'PRICE_LIST_DISABLED'
  | 'NOT_A_SELLING_PRICE_LIST'
  | 'PRICE_LIST_IS_BUYING_LIST'
  | 'PRICE_PERMISSION_DENIED'
  | 'PRICE_LOOKUP_FAILED'

export interface AvailablePrice {
  status: 'available'
  /** Numeric price exactly as stored in ERPNext (never rounded server-side). */
  amount: number
  currency: string
  priceList: string
  /** Unit the price applies to. */
  uom: string
  /** Unit the scanned barcode / item is sold in. */
  requestedUom: string
  /** `stock_uom_fallback` = no price for the requested unit, so the stock-unit price is shown and labelled. */
  uomMatch: 'exact' | 'stock_uom_fallback'
  validFrom: string | null
  validUpto: string | null
}

export interface UnavailablePrice {
  status: 'unavailable'
  priceList: string
  reason: PriceUnavailableReason
  message: string
  /** Units that do have a valid price (only for NO_PRICE_FOR_UOM). */
  availableUoms?: string[]
}

export type SellingPrice = AvailablePrice | UnavailablePrice

export interface MetadataEntry {
  field: string
  label: string
  value: string | number | boolean
}

export interface UomConversion {
  uom: string
  factor: number
}

export interface Product {
  itemCode: string
  itemName: string
  /** How the scan was matched: the Item Barcode table, or (opt-in) an exact Item Code match. */
  matchedBy: 'barcode' | 'item_code'
  /** The barcode exactly as stored in ERPNext (null when matched by item code). */
  barcode: string | null
  barcodeType: string | null
  /** Barcode-specific unit from the Item Barcode row, if set. */
  barcodeUom: string | null
  /** Unit the item is being looked up in (barcode UOM → sales UOM → stock UOM). */
  uom: string
  stockUom: string | null
  description: string | null
  itemGroup: string | null
  brand: string | null
  hasImage: boolean
  weight: { value: number; uom: string | null } | null
  isStockItem: boolean | null
  disabled: boolean
  hasVariants: boolean
  variantOf: string | null
  uomConversions: UomConversion[]
  /** Admin-allowlisted extra fields (ITEM_METADATA_FIELDS). */
  metadata: MetadataEntry[]
  /** Convenience copies of `price` — null whenever the price is unavailable (never 0 as a stand-in). */
  sellingPrice: number | null
  currency: string | null
  priceList: string
  price: SellingPrice
}

export interface SessionInfo {
  userId: string
  access: 'granted'
}

export interface HealthInfo {
  status: 'ok'
  time: string
}
