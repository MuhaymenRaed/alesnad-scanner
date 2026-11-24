const FIELD_PARAMS = new Set(['identifier', 'email_address', 'password', 'code', 'first_name', 'last_name'])

/**
 * True when Clerk attributed the error to a form field (`meta.paramName`). Those are rendered
 * next to the field from the hook's `errors.fields`, so they must not also go into the banner.
 */
export function isFieldError(error: unknown): boolean {
  const param = (error as { errors?: Array<{ meta?: { paramName?: string } }> } | null)?.errors?.[0]?.meta?.paramName
  return typeof param === 'string' && FIELD_PARAMS.has(param)
}

/** Readable text for a Clerk error object (field error, global error or returned error). */
export function clerkMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!error || typeof error !== 'object') return fallback
  const e = error as { longMessage?: unknown; message?: unknown; errors?: Array<{ longMessage?: string; message?: string }> }
  if (typeof e.longMessage === 'string' && e.longMessage) return e.longMessage
  const nested = e.errors?.[0]
  if (nested) return nested.longMessage || nested.message || fallback
  if (typeof e.message === 'string' && e.message) return e.message
  return fallback
}
