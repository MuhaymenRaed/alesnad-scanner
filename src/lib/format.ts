/**
 * Price formatting. The amount comes from ERPNext as a number; it is formatted with the
 * currency's standard number of decimals (from Intl/ISO 4217) but never rounded away: extra
 * decimals stored in ERPNext are shown (up to 6). No currency symbol is hard-coded.
 */
export function formatAmount(amount: number, currency: string, locale?: string): string {
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

export function formatTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}

export function formatDate(isoDate: string, locale?: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(date.getTime()) ? isoDate : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}
