/**
 * Barcode input rules, shared by the browser and the server.
 *
 * Barcodes are always strings: leading zeros and every inner character are preserved.
 * Only surrounding whitespace (e.g. a trailing newline from a scanner) is removed.
 */

/** ERPNext stores Item Barcode.barcode (and Item names) in a Data field: varchar(140). */
export const MAX_BARCODE_LENGTH = 140

// C0 control characters and DEL, except GS (\u001D), the GS1 group separator.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[\u0000-\u001C\u001E\u001F\u007F]/

export type IdentifierValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_characters' | 'not_a_string'; message: string }

/** Trim accidental surrounding whitespace only. Never converts to a number. */
export function normalizeBarcodeInput(raw: string): string {
  return raw.trim()
}

function validateIdentifier(raw: unknown, label: string): IdentifierValidation {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'not_a_string', message: `Provide a single ${label}.` }
  }
  const value = normalizeBarcodeInput(raw)
  if (value.length === 0) {
    return { ok: false, reason: 'empty', message: `Enter or scan a ${label}.` }
  }
  if (value.length > MAX_BARCODE_LENGTH) {
    return {
      ok: false,
      reason: 'too_long',
      message: `That ${label} is too long (maximum ${MAX_BARCODE_LENGTH} characters).`,
    }
  }
  if (FORBIDDEN_CHARACTERS.test(value)) {
    return { ok: false, reason: 'invalid_characters', message: `That ${label} contains invalid characters.` }
  }
  return { ok: true, value }
}

export function validateBarcode(raw: unknown): IdentifierValidation {
  return validateIdentifier(raw, 'barcode')
}

export function validateItemCode(raw: unknown): IdentifierValidation {
  return validateIdentifier(raw, 'item code')
}
