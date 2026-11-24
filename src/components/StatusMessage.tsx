import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '../lib/messages'

const TONES: Record<Tone | 'loading', { box: string; icon: ReactNode; label: string }> = {
  info: {
    box: 'border-info/35 bg-info/8',
    icon: <Info className="size-5 shrink-0 text-info" aria-hidden />,
    label: 'Information',
  },
  success: {
    box: 'border-success/35 bg-success/8',
    icon: <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />,
    label: 'Success',
  },
  warning: {
    box: 'border-warning/40 bg-warning/8',
    icon: <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />,
    label: 'Warning',
  },
  error: {
    box: 'border-danger/35 bg-danger/8',
    icon: <XCircle className="size-5 shrink-0 text-danger" aria-hidden />,
    label: 'Error',
  },
  loading: {
    box: 'border-line bg-surface',
    icon: <Loader2 className="size-5 shrink-0 text-brand motion-safe:animate-spin" aria-hidden />,
    label: 'Working',
  },
}

/** Status banner: tone is conveyed by icon + visually hidden label + text, never by colour alone. */
export function StatusMessage(props: { tone: Tone | 'loading'; title: string; children?: ReactNode; action?: ReactNode }) {
  const tone = TONES[props.tone]
  return (
    <div className={`flex gap-3 rounded-card border p-4 text-ink ${tone.box}`} role={props.tone === 'error' ? 'alert' : 'status'}>
      {tone.icon}
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          <span className="sr-only">{tone.label}: </span>
          {props.title}
        </p>
        {props.children && <div className="mt-1 space-y-0.5 text-sm text-ink/80">{props.children}</div>}
        {props.action && <div className="mt-3">{props.action}</div>}
      </div>
    </div>
  )
}
