/** Platform detection and Arabic steps for re-enabling a blocked camera. */
export type Platform = 'android' | 'android-app' | 'ios-safari' | 'ios-other' | 'ios-app' | 'desktop'

/** Rough platform detection — only used to show the right "how to re-enable the camera" steps. */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios) {
    if (standalone) return 'ios-app'
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  }
  if (/Android/i.test(ua)) return standalone ? 'android-app' : 'android'
  return 'desktop'
}

/** Step-by-step Arabic instructions for re-allowing the camera on each platform. */
export function permissionSteps(platform: Platform): string[] {
  switch (platform) {
    case 'android':
      return [
        'اضغط على رمز القفل 🔒 (أو رمز الإعدادات) بجانب عنوان الموقع في أعلى الشاشة.',
        'اختر «الأذونات» أو «إعدادات الموقع».',
        'اجعل «الكاميرا» على «السماح».',
        'ارجع إلى هنا واضغط «إعادة المحاولة».',
      ]
    case 'android-app':
      return [
        'افتح متصفح Chrome ثم اضغط ⋮ ← «الإعدادات».',
        'اختر «إعدادات المواقع» ← «الكاميرا».',
        'اختر هذا الموقع واجعل الكاميرا على «السماح».',
        'ارجع إلى التطبيق واضغط «إعادة المحاولة».',
      ]
    case 'ios-safari':
      return [
        'اضغط على «aA» (أو رمز الإعدادات) في شريط العنوان.',
        'اختر «إعدادات موقع الويب».',
        'اجعل «الكاميرا» على «السماح».',
        'اضغط «إعادة تحميل الصفحة» ثم افتح الكاميرا.',
      ]
    case 'ios-other':
      return [
        'افتح تطبيق «الإعدادات» في الآيفون.',
        'انزل إلى تطبيق المتصفح الذي تستخدمه (مثل Chrome).',
        'فعّل «الكاميرا».',
        'ارجع إلى هنا واضغط «إعادة تحميل الصفحة».',
      ]
    case 'ios-app':
      return [
        'افتح تطبيق «الإعدادات» ← «Safari» ← «الكاميرا».',
        'اختر «السماح» (أو «اسأل»).',
        'أغلق التطبيق وافتحه من جديد ثم افتح الكاميرا.',
      ]
    default:
      return [
        'اضغط على رمز القفل 🔒 أو رمز الكاميرا في شريط العنوان.',
        'اجعل «الكاميرا» على «السماح».',
        'اضغط «إعادة المحاولة» أو أعد تحميل الصفحة.',
      ]
  }
}
