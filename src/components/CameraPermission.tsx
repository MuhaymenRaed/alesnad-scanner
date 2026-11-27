import { Camera, CameraOff, RefreshCw, RotateCw } from 'lucide-react'
import { detectPlatform, permissionSteps } from '../lib/cameraHelp'
import { outlineButton, primaryButton } from './ui'


/** Shown before the browser's own prompt: says why, then one big button. */
export function CameraPermissionAsk({ onAllow }: { onAllow(): void }) {
  return (
    <section aria-label="إذن الكاميرا" className="rounded-panel border border-line bg-surface p-5 text-center sm:p-6">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Camera className="size-8" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-extrabold">اسمح باستخدام الكاميرا</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        لمسح الباركود بالكاميرا سيطلب المتصفح الإذن. اضغط الزر ثم اختر <strong className="text-ink">«السماح»</strong>.
      </p>
      <button type="button" onClick={onAllow} className={`${primaryButton} mt-5 min-h-14 w-full text-base sm:w-auto sm:px-10`}>
        <Camera className="size-5" aria-hidden /> السماح باستخدام الكاميرا
      </button>
      <p className="mt-3 text-xs text-muted">يُستخدم الإذن لمسح الباركود فقط، ولا يتم تسجيل أو حفظ أي صورة.</p>
    </section>
  )
}

/** Shown when the camera was blocked: clear steps for this device, retry and reload. */
export function CameraPermissionDenied({ onRetry }: { onRetry(): void }) {
  const platform = detectPlatform()
  const steps = permissionSteps(platform)
  const reloadFirst = platform === 'ios-safari' || platform === 'ios-other' || platform === 'ios-app'
  return (
    <section aria-label="الكاميرا محظورة" role="alert" className="rounded-panel border border-danger/35 bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <CameraOff className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold">الكاميرا محظورة لهذا الموقع</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">تم رفض إذن الكاميرا. لإعادة تفعيلها اتبع الخطوات التالية:</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3 rounded-control bg-subtle px-3.5 py-3 text-sm leading-relaxed">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-fill text-xs font-extrabold text-white">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <button type="button" onClick={onRetry} className={`${primaryButton} min-h-12 text-base ${reloadFirst ? 'sm:order-2' : ''}`}>
          <RotateCw className="size-5" aria-hidden /> إعادة المحاولة
        </button>
        <button type="button" onClick={() => window.location.reload()} className={`${outlineButton} min-h-12 text-base`}>
          <RefreshCw className="size-5" aria-hidden /> إعادة تحميل الصفحة
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">يمكنك دائماً كتابة الباركود أو استخدام ماسح USB/بلوتوث بدلاً من الكاميرا.</p>
    </section>
  )
}
