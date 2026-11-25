const FIELD_PARAMS = new Set(['identifier', 'email_address', 'password', 'code', 'first_name', 'last_name'])

/**
 * True when Clerk attributed the error to a form field (`meta.paramName`). Those are rendered
 * next to the field from the hook's `errors.fields`, so they must not also go into the banner.
 */
export function isFieldError(error: unknown): boolean {
  const param = (error as { errors?: Array<{ meta?: { paramName?: string } }> } | null)?.errors?.[0]?.meta?.paramName
  return typeof param === 'string' && FIELD_PARAMS.has(param)
}

/** Arabic wording for Clerk's error codes (Clerk returns English text; its codes are stable). */
const ARABIC_BY_CODE: Record<string, string> = {
  form_identifier_not_found: 'لم نجد حساباً بهذا البريد الإلكتروني.',
  form_password_incorrect: 'كلمة المرور غير صحيحة. حاول مرة أخرى.',
  form_code_incorrect: 'الرمز غير صحيح. تحقّق منه وأعد المحاولة.',
  verification_expired: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
  verification_failed: 'فشل التحقق. اطلب رمزاً جديداً وأعد المحاولة.',
  too_many_requests: 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  rate_limit_exceeded: 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  user_locked: 'تم قفل الحساب مؤقتاً بسبب محاولات كثيرة. حاول لاحقاً.',
  form_password_pwned: 'كلمة المرور هذه ظهرت في تسريب بيانات سابق. اختر كلمة مرور أخرى.',
  form_password_length_too_short: 'كلمة المرور قصيرة جداً.',
  form_password_not_strong_enough: 'كلمة المرور ضعيفة. اختر كلمة مرور أقوى.',
  form_password_validation_failed: 'كلمة المرور لا تستوفي الشروط المطلوبة.',
  form_param_format_invalid: 'صيغة الإدخال غير صحيحة. تحقّق من البريد الإلكتروني.',
  form_param_nil: 'هذا الحقل مطلوب.',
  form_param_missing: 'هذا الحقل مطلوب.',
  form_identifier_exists: 'يوجد حساب مسجّل بهذا البريد الإلكتروني.',
  strategy_for_user_invalid: 'طريقة الدخول هذه غير متاحة لحسابك.',
  sign_up_restricted: 'إنشاء الحسابات مقيّد. تواصل مع المسؤول للحصول على دعوة.',
  not_allowed_access: 'غير مسموح لهذا الحساب بالدخول. تواصل مع المسؤول.',
  session_exists: 'أنت مسجّل الدخول بالفعل.',
  captcha_invalid: 'فشل التحقق من أنك لست روبوتاً. أعد المحاولة.',
}

const GENERIC = 'تعذّر إتمام العملية. حاول مرة أخرى.'

function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const e = error as { code?: unknown; errors?: Array<{ code?: string }> }
  if (typeof e.code === 'string') return e.code
  return e.errors?.[0]?.code
}

/** Arabic text for a Clerk error object (field error, global error or returned error). */
export function clerkMessage(error: unknown, fallback: string = GENERIC): string {
  const code = codeOf(error)
  if (code && ARABIC_BY_CODE[code]) return ARABIC_BY_CODE[code]
  return fallback
}
