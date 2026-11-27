import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Flashlight, FlashlightOff, Loader2, RotateCw, SwitchCamera } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraPermissionAsk, CameraPermissionDenied } from './CameraPermission'
import { StatusMessage } from './StatusMessage'
import { primaryButton } from './ui'

/**
 * Camera barcode scanner.
 *
 * Speed: uses the browser's native BarcodeDetector (hardware-accelerated; Chrome on Android) and
 * falls back to ZXing (iPhone/others), restricted to retail formats so each frame decodes quickly.
 * Accuracy: picks the main rear lens (not ultra-wide), asks for continuous autofocus and 1080p,
 * offers the torch, and ignores a barcode that stays in view so it is looked up once.
 */

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]
/** A barcode that stays in view is ignored until it has been out of view for this long. */
const SAME_CODE_COOLDOWN_MS = 2500
const NATIVE_INTERVAL_MS = 70
const CAMERA_KEY = 'scanner.cameraId'

interface DetectedBarcode {
  rawValue: string
  boundingBox?: DOMRectReadOnly
}
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type NativeDetectorCtor = {
  new (options: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

type CameraError = { title: string; hint: string }

function describeCameraError(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { title: 'تم رفض إذن الكاميرا', hint: 'اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم افتح الكاميرا مجدداً. يمكنك الكتابة أو استخدام الماسح اليدوي.' }
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return { title: 'لا توجد كاميرا', hint: 'لا توجد كاميرا متاحة على هذا الجهاز. استخدم حقل الباركود.' }
    case 'NotReadableError':
    case 'TrackStartError':
      return { title: 'الكاميرا مشغولة', hint: 'تطبيق أو تبويب آخر يستخدم الكاميرا. أغلقه ثم أعد المحاولة.' }
    case 'SecurityError':
      return { title: 'الكاميرا محظورة', hint: 'تعمل الكاميرا فقط عبر اتصال آمن (HTTPS).' }
    default:
      return { title: 'خطأ في الكاميرا', hint: 'تعذّر تشغيل الكاميرا. استخدم حقل الباركود.' }
  }
}

const cameraSupported = () => window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'

async function createNativeDetector(): Promise<NativeDetector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    const supported = await Ctor.getSupportedFormats()
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format))
    return formats.includes('ean_13') ? new Ctor({ formats }) : null
  } catch {
    return null
  }
}

/** Prefer the main rear lens: ultra-wide/telephoto lenses focus poorly on small barcodes. */
function pickRearCamera(devices: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
  const cameras = devices.filter((d) => d.kind === 'videoinput')
  const rear = cameras.filter((d) => /back|rear|environment|خلف/i.test(d.label))
  const pool = rear.length > 0 ? rear : cameras
  return (
    pool.find((d) => /camera2 0\b|camera 0\b/i.test(d.label)) ??
    pool.find((d) => !/wide|ultra|tele|0\.5|macro|depth/i.test(d.label)) ??
    pool[0]
  )
}

let audioContext: AudioContext | null = null
function beep() {
  try {
    audioContext ??= new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 1760
    gain.gain.setValueAtTime(0.12, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.09)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.1)
  } catch {
    // Audio is optional feedback.
  }
}

function readStoredCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_KEY)
  } catch {
    return null
  }
}
function storeCamera(id: string) {
  try {
    localStorage.setItem(CAMERA_KEY, id)
  } catch {
    // Not essential.
  }
}

const GRANTED_KEY = 'scanner.cameraGranted'
/** Remember that the camera was allowed, so later visits start it straight away (no extra tap). */
function rememberGranted(granted: boolean) {
  try {
    if (granted) localStorage.setItem(GRANTED_KEY, '1')
    else localStorage.removeItem(GRANTED_KEY)
  } catch {
    // Not essential.
  }
}
function grantedBefore(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === '1'
  } catch {
    return false
  }
}
const isPermissionError = (error: unknown) => ['NotAllowedError', 'PermissionDeniedError'].includes((error as Error | null)?.name ?? '')

/**
 * Permission view: 'checking' (asking the Permissions API), 'ask' (explain, then one button that
 * triggers the browser prompt), 'denied' (step-by-step help to re-enable), 'live' (camera running).
 */
type AccessView = 'checking' | 'ask' | 'denied' | 'live'
function initialView(): AccessView {
  if (!cameraSupported() || grantedBefore()) return 'live'
  return typeof navigator.permissions?.query === 'function' ? 'checking' : 'ask'
}

interface Props {
  /** True while a lookup is running: detections are ignored (scanning is paused). */
  paused: boolean
  onDetected(code: string): void
}

export function CameraScanner({ paused, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<'starting' | 'scanning' | 'error'>(() => (cameraSupported() ? 'starting' : 'error'))
  const [error, setError] = useState<CameraError | null>(() =>
    cameraSupported() ? null : { title: 'الكاميرا غير متاحة', hint: 'يتطلب المسح بالكاميرا اتصالاً آمناً (HTTPS) ومتصفحاً يدعم الكاميرا. استخدم حقل الباركود.' },
  )
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null)
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false })
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(() => readStoredCamera())
  const [view, setView] = useState<AccessView>(initialView)
  const [attempt, setAttempt] = useState(0)

  const pausedRef = useRef(paused)
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    pausedRef.current = paused
    onDetectedRef.current = onDetected
  })
  // A new start (camera switched, permission granted, retry) shows "starting" again
  // (adjust-state-while-rendering).
  const runKey = `${view}|${deviceId ?? ''}|${attempt}`
  const [startedFor, setStartedFor] = useState(runKey)
  if (startedFor !== runKey) {
    setStartedFor(runKey)
    if (cameraSupported()) {
      setPhase('starting')
      setError(null)
    }
  }

  // Follow the browser's camera permission: if the user re-allows it in the site settings, the
  // camera starts by itself; if it gets blocked, the help card appears.
  useEffect(() => {
    if (!cameraSupported() || typeof navigator.permissions?.query !== 'function') return
    let cancelled = false
    let status: PermissionStatus | null = null
    const apply = (state: PermissionState) => {
      if (cancelled) return
      if (state === 'granted') setView('live')
      else if (state === 'denied') {
        rememberGranted(false)
        setView('denied')
      } else setView((current) => (current === 'checking' ? 'ask' : current))
    }
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((result) => {
        status = result
        apply(result.state)
        result.onchange = () => apply(result.state)
      })
      .catch(() => {
        if (!cancelled) setView((current) => (current === 'checking' ? 'ask' : current))
      })
    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [])
  const lastSeen = useRef<{ code: string; at: number } | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const handleCode = useCallback((code: string) => {
    const now = Date.now()
    const previous = lastSeen.current
    lastSeen.current = { code, at: now }
    // Same code still in view (seen recently) → ignore; it must leave the frame first.
    if (previous?.code === code && now - previous.at < SAME_CODE_COOLDOWN_MS) return
    if (pausedRef.current) return
    setLastDetected(code)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 350)
    navigator.vibrate?.(60)
    beep()
    onDetectedRef.current(code)
  }, [])

  useEffect(() => {
    if (!cameraSupported() || view !== 'live') return
    let cancelled = false
    let stream: MediaStream | null = null
    let zxingControls: IScannerControls | null = null
    let timer: number | undefined
    const video = videoRef.current

    const start = async () => {
      const base: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { ...base, deviceId: { exact: deviceId } } : { ...base, facingMode: { ideal: 'environment' } },
        })
      } catch (e) {
        if (deviceId && (e as Error).name === 'OverconstrainedError') {
          setDeviceId(null) // remembered camera is gone: retry with the default rear camera
          return
        }
        throw e
      }
      if (cancelled) return
      rememberGranted(true)

      // Labels are only visible after permission: now switch to the main rear lens if needed.
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
      if (cancelled) return
      setCameras(devices)
      const track = stream.getVideoTracks()[0]!
      const currentId = track.getSettings().deviceId
      if (!deviceId) {
        const best = pickRearCamera(devices)
        if (best?.deviceId && best.deviceId !== currentId) {
          storeCamera(best.deviceId)
          setDeviceId(best.deviceId) // effect restarts with the chosen lens
          return
        }
        if (currentId) storeCamera(currentId)
      }

      trackRef.current = track
      const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }
      if (capabilities.focusMode?.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined)
      }
      setTorch({ supported: capabilities.torch === true, on: false })

      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => undefined)
      if (cancelled) return

      const native = await createNativeDetector()
      if (cancelled) return
      if (native) {
        setEngine('native')
        let busy = false
        const tick = async () => {
          if (cancelled) return
          if (!busy && video.readyState >= 2) {
            busy = true
            try {
              const found = await native.detect(video)
              // Several codes in view: take the one nearest the centre of the frame.
              const best = found
                .map((b) => ({ b, d: b.boundingBox ? Math.hypot(b.boundingBox.x + b.boundingBox.width / 2 - video.videoWidth / 2, b.boundingBox.y + b.boundingBox.height / 2 - video.videoHeight / 2) : 0 }))
                .sort((x, y) => x.d - y.d)[0]?.b
              if (best?.rawValue) handleCode(best.rawValue)
            } catch {
              // A frame that cannot be read is simply skipped.
            } finally {
              busy = false
            }
          }
          timer = window.setTimeout(() => void tick(), NATIVE_INTERVAL_MS)
        }
        void tick()
      } else {
        setEngine('zxing')
        const hints = new Map<DecodeHintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS],
          [DecodeHintType.TRY_HARDER, true],
        ])
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 60, delayBetweenScanSuccess: 150 })
        zxingControls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) handleCode(result.getText())
        })
        if (cancelled) zxingControls.stop()
      }
      setPhase('scanning')
    }

    start().catch((e: unknown) => {
      if (cancelled) return
      if (isPermissionError(e)) {
        rememberGranted(false)
        setView('denied')
        return
      }
      setError(describeCameraError(e))
      setPhase('error')
    })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      zxingControls?.stop()
      stream?.getTracks().forEach((t) => t.stop())
      const attached = video?.srcObject
      // Duck-typed: cleanup must never throw, even where the MediaStream global is missing.
      if (attached && typeof (attached as MediaStream).getTracks === 'function') (attached as MediaStream).getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
      trackRef.current = null
    }
  }, [deviceId, handleCode, view, attempt])

  const toggleTorch = async () => {
    const track = trackRef.current
    if (!track) return
    const on = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorch({ supported: true, on })
    } catch {
      setTorch({ supported: false, on: false })
    }
  }

  const switchCamera = () => {
    if (cameras.length < 2) return
    const index = cameras.findIndex((c) => c.deviceId === (deviceId ?? trackRef.current?.getSettings().deviceId))
    const next = cameras[(index + 1) % cameras.length]!
    storeCamera(next.deviceId)
    setDeviceId(next.deviceId)
  }

  if (cameraSupported() && view === 'checking') return <StatusMessage tone="loading" title="جارٍ التحقق من إذن الكاميرا…" />
  if (cameraSupported() && view === 'ask') return <CameraPermissionAsk onAllow={() => setView('live')} />
  if (cameraSupported() && view === 'denied') {
    return (
      <CameraPermissionDenied
        onRetry={() => {
          setView('live')
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  if (phase === 'error' && error) {
    return (
      <StatusMessage
        tone="warning"
        title={error.title}
        action={
          cameraSupported() ? (
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={primaryButton}>
              <RotateCw className="size-4" aria-hidden /> إعادة المحاولة
            </button>
          ) : undefined
        }
      >
        {error.hint}
      </StatusMessage>
    )
  }

  return (
    <section aria-label="ماسح الكاميرا" className="overflow-hidden rounded-panel border border-line bg-charcoal">
      <div className="relative aspect-[4/3] max-h-[62dvh] w-full md:aspect-video">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-label="معاينة الكاميرا" />
        {/* Aiming guide — turns green on a successful read */}
        <div
          className={`pointer-events-none absolute inset-x-[8%] inset-y-[24%] rounded-card border-2 shadow-[0_0_0_100vmax_rgba(35,38,44,0.5)] transition-colors duration-150 ${flash ? 'border-emerald-400' : 'border-white/85'}`}
          aria-hidden
        >
          <div
            className={`absolute inset-x-3 h-0.5 rounded-full ${paused ? 'top-1/2 bg-white/60' : 'top-1/2 bg-[#e11d2e] shadow-[0_0_12px_#e11d2e] motion-safe:animate-sweep'}`}
          />
        </div>
        {phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden /> جارٍ تشغيل الكاميرا…
          </div>
        )}
        {phase === 'scanning' && (
          <div className="absolute inset-x-3 bottom-3 flex justify-between gap-2">
            {torch.supported ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-pressed={torch.on}
                aria-label={torch.on ? 'إطفاء الضوء' : 'تشغيل الضوء'}
                className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur aria-pressed:bg-amber-400 aria-pressed:text-black"
              >
                {torch.on ? <FlashlightOff className="size-5" aria-hidden /> : <Flashlight className="size-5" aria-hidden />}
              </button>
            ) : (
              <span />
            )}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                aria-label="تبديل الكاميرا"
                className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
              >
                <SwitchCamera className="size-5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="flex min-h-12 items-center gap-2 px-4 py-3 text-sm text-white/85" aria-live="polite">
        {phase !== 'scanning' ? (
          'بانتظار إذن الكاميرا…'
        ) : paused ? (
          'جارٍ البحث عن المنتج — المسح متوقف مؤقتاً.'
        ) : lastDetected ? (
          <>
            آخر قراءة: <span dir="ltr" className="font-mono text-white">{lastDetected}</span> — وجّه الكاميرا إلى الباركود التالي.
          </>
        ) : (
          <>وجّه الكاميرا إلى الباركود داخل الإطار{engine === 'native' ? ' · قراءة سريعة' : ''}.</>
        )}
      </p>
    </section>
  )
}
