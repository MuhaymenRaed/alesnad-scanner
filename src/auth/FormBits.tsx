import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { fieldInput, fieldLabel, primaryButton } from '../components/ui'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>

export function TextField({ label, error, hint, ...input }: InputProps & { label: string; error?: string | null; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldInput}
        {...input}
      />
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

export function PasswordField({ label, error, action, ...input }: InputProps & { label: string; error?: string | null; action?: ReactNode }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={fieldLabel}>
          {label}
        </label>
        {action}
      </div>
      {/* The field is always left-to-right, so the toggle sits on the physical left with matching padding. */}
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${fieldInput} pl-12`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          aria-pressed={visible}
          className="absolute inset-y-0 left-0 flex w-12 items-center justify-center rounded-l-control text-muted hover:text-ink"
        >
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

/** One-time code: numeric keypad on phones, OS autofill from SMS/e-mail where supported. */
export function CodeField({ label, error, numeric = true, ...input }: InputProps & { label: string; error?: string | null; numeric?: boolean }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        inputMode={numeric ? 'numeric' : 'text'}
        dir="ltr"
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={numeric ? 8 : 24}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${fieldInput} min-h-14 text-center font-mono text-2xl tracking-[0.5em]`}
        {...input}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-semibold text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function FormAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-control border px-4 py-3 text-sm font-semibold ${tone === 'error' ? 'border-danger/35 bg-danger/8 text-danger' : 'border-info/30 bg-info/8 text-ink'}`}
    >
      {children}
    </div>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className={`${primaryButton} min-h-12 w-full text-base`}>
      {busy && <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
