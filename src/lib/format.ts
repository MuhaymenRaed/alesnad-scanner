/**
 * Arabic formatting with Western (Latin) digits — the digits used on ERPNext prices and barcodes,
 * so what staff read on screen matches the label and the invoice.
 */
const LOCALE = 'ar-IQ-u-nu-latn'

/**
 * Price amount with the currency's standard decimals (ISO 4217, from Intl) — extra decimals stored
 * in ERPNext are never rounded away (up to 6). The currency is shown separately (currencyLabel).
 */
export function formatAmount(amount: number, currency: string, locale: string = LOCALE): string {
  let digits = 2
  try {
    digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().minimumFractionDigits ?? 2
  } catch {
    // Unknown/custom currency code: fall back to 2 decimals.
  }
  const stored = (String(amount).split('.')[1] ?? '').length
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, Math.min(stored, 6)),
  }).format(amount)
}

const CURRENCY_LABELS: Record<string, string> = {
  IQD: 'د.ع',
  USD: 'دولار',
  AED: 'د.إ',
  SAR: 'ر.س',
  EUR: 'يورو',
}

/** Short Arabic currency label (د.ع for IQD); falls back to the ISO code. */
export function currencyLabel(code: string): string {
  return CURRENCY_LABELS[code.toUpperCase()] ?? code
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(date.getTime()) ? isoDate : new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(date)
}

const UOM_LABELS: Record<string, string> = {
  unit: 'قطعة',
  nos: 'قطعة',
  pcs: 'قطعة',
  piece: 'قطعة',
  box: 'علبة',
  carton: 'كارتون',
  pair: 'زوج',
  set: 'طقم',
  pack: 'باكيت',
  kg: 'كغم',
  gram: 'غرام',
  meter: 'متر',
}

/** Arabic name for common ERPNext units; unknown units are shown as stored. */
export function uomLabel(uom: string | null | undefined): string {
  if (!uom) return ''
  return UOM_LABELS[uom.trim().toLowerCase()] ?? uom
}

const FIELD_LABELS: Record<string, string> = {
  custom_category: 'الفئة',
  custom_sub_category: 'الفئة الفرعية',
  custom_device_color: 'اللون',
  custom_device_storage: 'الذاكرة',
  custom_device_ram: 'الرام',
  custom_arabic_item_name: 'الاسم العربي',
  custom_srep_display_name: 'الاسم المعروض',
  custom_company_item_name: 'اسم الشركة للمادة',
  country_of_origin: 'بلد المنشأ',
  warranty_period: 'مدة الضمان (أيام)',
  shelf_life_in_days: 'مدة الصلاحية (أيام)',
  customs_tariff_number: 'رقم التعرفة الجمركية',
}

/** Arabic label for an ERPNext field; falls back to the label ERPNext provided. */
export function fieldLabel(field: string, erpLabel: string): string {
  return FIELD_LABELS[field] ?? erpLabel
}
