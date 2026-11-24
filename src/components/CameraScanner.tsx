import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Loader2, VideoOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StatusMessage } from './StatusMessage'

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
]

/** A barcode that stays in view is ignored until it has been out of view for this long. */
const SAME_CODE_COOLDOWN_MS = 2500

type CameraError = { title: string; hint: string }

function describeCameraError(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { title: 'Camera permission denied', hint: 'Allow camera access for this site in your browser settings, then open the camera again. You can still type or use a scanner.' }
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return { title: 'No camera found', hint: 'This device has no usable camera. Use the barcode field instead.' }
    case 'NotReadableError':
    case 'TrackStartError':
      return { title: 'Camera is busy', hint: 'Another app or tab is using the camera. Close it and try again.' }
    case 'SecurityError':
      return { title: 'Camera blocked', hint: 'The camera only works over HTTPS (or on localhost).' }
    default:
      return { title: 'Camera error', hint: 'The camera could not be started. Use the barcode field instead.' }
  }
}

interface Props {
  /** True while a lookup is running: detections are ignored (scanning is paused). */
  paused: boolean
  onDetected(code: string): void
}

const cameraSupported = () => window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'

const UNSUPPORTED: CameraError = {
  title: 'Camera unavailable',
  hint: 'Camera scanning needs HTTPS (or localhost) and a browser with camera support. Use the barcode field instead.',
}

export function CameraScanner({ paused, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<'starting' | 'scanning' | 'error'>(() => (cameraSupported() ? 'starting' : 'error'))
  const [error, setError] = useState<CameraError | null>(() => (cameraSupported() ? null : UNSUPPORTED))
  const [lastDetected, setLastDetected] = useState<string | null>(null)

  // Latest props for the decode callback, which is created once per camera session.
  const pausedRef = useRef(paused)
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    pausedRef.current = paused
    onDetectedRef.current = onDetected
  })
  const lastSeen = useRef<{ code: string; at: number } | null>(null)

  useEffect(() => {
    if (!cameraSupported()) return
    let controls: IScannerControls | null = null
    let cancelled = false
    const video = videoRef.current

    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 300 })

    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        video ?? undefined,
        (result) => {
          if (!result) return
          const code = result.getText()
          const now = Date.now()
          const previous = lastSeen.current
          lastSeen.current = { code, at: now }
          // Same code still in view (seen recently) → ignore; it must leave the frame first.
          if (previous?.code === code && now - previous.at < SAME_CODE_COOLDOWN_MS) return
          if (pausedRef.current) return
          setLastDetected(code)
          navigator.vibrate?.(60)
          onDetectedRef.current(code)
        },
      )
      .then((c) => {
        if (cancelled) c.stop()
        else {
          controls = c
          setPhase('scanning')
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(describeCameraError(e))
        setPhase('error')
      })

    return () => {
      cancelled = true
      controls?.stop()
      // Belt and braces: make sure every camera track is released.
      const stream = video?.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
      BrowserCodeReader.releaseAllStreams()
    }
  }, [])

  if (phase === 'error' && error) {
    return (
      <StatusMessage tone="warning" title={error.title}>
        {error.hint}
      </StatusMessage>
    )
  }

  return (
    <section aria-label="Camera scanner" className="overflow-hidden rounded-panel border border-line bg-charcoal">
      <div className="relative aspect-[4/3] max-h-[60dvh] w-full md:aspect-video">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-label="Camera preview" />
        {/* Aiming guide */}
        <div className="pointer-events-none absolute inset-x-[10%] inset-y-[22%] rounded-card border-2 border-white/85 shadow-[0_0_0_100vmax_rgba(35,38,44,0.5)]" aria-hidden>
          <div className={`absolute inset-x-3 h-0.5 rounded-full ${paused ? 'top-1/2 bg-white/60' : 'top-1/2 bg-[#e11d2e] shadow-[0_0_12px_#e11d2e] motion-safe:animate-sweep'}`} />
        </div>
        {phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden /> Starting camera…
          </div>
        )}
      </div>
      <p className="flex min-h-12 items-center gap-2 px-4 py-3 text-sm text-white/85" aria-live="polite">
        {phase !== 'scanning' ? (
          <>
            <VideoOff className="size-4" aria-hidden /> Waiting for camera permission…
          </>
        ) : paused ? (
          'Looking up the scanned code — scanning paused.'
        ) : lastDetected ? (
          <>
            Last read: <span className="font-mono text-white">{lastDetected}</span>. Move to the next barcode.
          </>
        ) : (
          'Point the camera at a barcode inside the frame.'
        )}
      </p>
    </section>
  )
}
