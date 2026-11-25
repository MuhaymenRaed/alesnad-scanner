import type { ApiErrorCode, PriceUnavailableReason } from '../../shared/api'

export type Tone = 'info' | 'success' | 'warning' | 'error'

export interface StatusCopy {
  title: string
  hint: string
  tone: Tone
}

/** Arabic wording for every error code: what happened and what to do next. */
const COPY: Partial<Record<ApiErrorCode, StatusCopy>> = {
  INVALID_BARCODE: { title: 'تحقّق من الباركود', hint: 'امسح الباركود مرة أخرى أو اكتب الرقم المطبوع تحته.', tone: 'warning' },
  INVALID_ITEM_CODE: { title: 'اختيار غير صالح', hint: 'امسح الباركود مرة أخرى واختر أحد المنتجات المعروضة.', tone: 'warning' },
  ITEM_NOT_FOUND: { title: 'المنتج غير موجود', hint: 'لا يوجد منتج بهذا الباركود في النظام. تأكّد من الرقم أو اطلب إضافة الباركود إلى المادة.', tone: 'warning' },
  ITEM_DISABLED: { title: 'المنتج معطّل', hint: 'هذا المنتج معطّل في النظام ولا يمكن بيعه.', tone: 'warning' },
  ITEM_OUT_OF_SCOPE: { title: 'المنتج خارج نطاق الماسح', hint: 'هذا الباركود يعود لمنتج خارج مجموعات المواد المفعّلة لهذا الماسح.', tone: 'warning' },
  RATE_LIMITED: { title: 'عمليات بحث كثيرة', hint: 'انتظر بضع ثوانٍ ثم امسح مرة أخرى.', tone: 'warning' },
  UNAUTHENTICATED: { title: 'تعذّر التحقق من الجلسة', hint: 'سجّل الدخول مرة أخرى للمتابعة.', tone: 'error' },
  SESSION_ENDED: { title: 'انتهت الجلسة', hint: 'سجّل الدخول مرة أخرى للمتابعة.', tone: 'error' },
  ACCESS_DENIED: { title: 'لا تملك صلاحية', hint: 'حسابك غير مسموح له باستخدام الماسح. تواصل مع المسؤول.', tone: 'error' },
  ERPNEXT_AUTH_FAILED: { title: 'مشكلة في الاتصال بالنظام', hint: 'تعذّر على الماسح تسجيل الدخول إلى ERPNext. تواصل مع المسؤول.', tone: 'error' },
  ERPNEXT_PERMISSION_DENIED: { title: 'مشكلة في صلاحيات النظام', hint: 'حساب الربط لا يملك صلاحية قراءة هذه البيانات. تواصل مع المسؤول.', tone: 'error' },
  ERPNEXT_TIMEOUT: { title: 'النظام بطيء حالياً', hint: 'استغرق ERPNext وقتاً طويلاً. أعد المحاولة بعد لحظة.', tone: 'error' },
  ERPNEXT_UNAVAILABLE: { title: 'تعذّر الوصول إلى النظام', hint: 'أعد المحاولة بعد لحظة. إذا تكرر ذلك أبلغ المسؤول.', tone: 'error' },
  ERPNEXT_ERROR: { title: 'خطأ من النظام', hint: 'أعد المحاولة. إذا تكرر ذلك أبلغ المسؤول.', tone: 'error' },
  NETWORK_ERROR: { title: 'لا يوجد اتصال بالخدمة', hint: 'تحقّق من اتصال الإنترنت ثم أعد المحاولة.', tone: 'error' },
  BAD_RESPONSE: { title: 'استجابة غير متوقعة', hint: 'أعد المحاولة بعد لحظة.', tone: 'error' },
}

export function statusCopy(code: ApiErrorCode, _fallbackMessage?: string): StatusCopy {
  return COPY[code] ?? { title: 'حدث خطأ', hint: 'أعد المحاولة.', tone: 'error' }
}

/** Arabic explanation for a missing selling price. */
export const PRICE_REASON: Record<PriceUnavailableReason, string> = {
  NO_PRICE_IN_LIST: 'لا يوجد سعر لهذا المنتج في قائمة أسعار البيع.',
  NO_VALID_PRICE: 'لا يوجد سعر بيع ساري المفعول اليوم لهذا المنتج.',
  NO_PRICE_FOR_UOM: 'لا يوجد سعر بيع لهذه الوحدة.',
  PRICE_LIST_NOT_FOUND: 'قائمة أسعار البيع المحددة غير موجودة في النظام.',
  PRICE_LIST_DISABLED: 'قائمة أسعار البيع معطّلة في النظام.',
  NOT_A_SELLING_PRICE_LIST: 'قائمة الأسعار المحددة ليست قائمة بيع.',
  PRICE_LIST_IS_BUYING_LIST: 'قائمة الأسعار المحددة قائمة شراء، لذلك لا تُعرض أسعارها.',
  PRICE_PERMISSION_DENIED: 'حساب الربط لا يملك صلاحية قراءة الأسعار.',
  PRICE_LOOKUP_FAILED: 'تعذّر جلب السعر من النظام حالياً.',
}
