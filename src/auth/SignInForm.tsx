import { useSignIn } from '@clerk/react'
import { ArrowLeft, Mail } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ghostButton, outlineButton } from '../components/ui'
import { signUpEnabled } from '../lib/config'
import { clerkMessage, isFieldError } from './clerkErrors'
import { CodeField, FormAlert, PasswordField, SubmitButton, TextField } from './FormBits'
import { useCooldown } from './useCooldown'

type Step = 'credentials' | 'email-code' | 'second-factor' | 'reset-request' | 'reset-code' | 'new-password'
type SecondFactor = 'totp' | 'phone_code' | 'email_code' | 'backup_code'

const SECOND_FACTOR_COPY: Record<SecondFactor, { title: string; body: string; label: string; numeric: boolean }> = {
  totp: { title: 'Two-step verification', body: 'Enter the 6-digit code from your authenticator app.', label: 'Authenticator code', numeric: true },
  phone_code: { title: 'Two-step verification', body: 'We sent a code to your phone.', label: 'Code from SMS', numeric: true },
  email_code: { title: 'Confirm it’s you', body: 'We sent a code to your e-mail to verify this device.', label: 'Code from e-mail', numeric: true },
  backup_code: { title: 'Use a backup code', body: 'Enter one of the backup codes you saved when you set up two-step verification.', label: 'Backup code', numeric: false },
}

function Heading({ title, arabic, children }: { title: string; arabic?: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.03em]">{title}</h1>
      {arabic && (
        <p lang="ar" dir="rtl" className="mt-0.5 text-left text-lg font-semibold text-muted">
          {arabic}
        </p>
      )}
      {children && <p className="mt-2 text-sm text-muted">{children}</p>}
    </div>
  )
}

/**
 * Fully custom sign-in built on Clerk's headless `useSignIn()` API — no Clerk UI and therefore
 * no Clerk badge. Handles: e-mail + password, e-mail code (passwordless), device verification
 * (`needs_client_trust`), two-step verification (TOTP / SMS / e-mail / backup code), and
 * forgotten passwords. Which of these apply is decided by the Clerk Dashboard settings.
 */
export function SignInForm({ destination }: { destination: string }) {
  const { signIn, errors, fetchStatus } = useSignIn()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [factor, setFactor] = useState<SecondFactor>('totp')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()
  const busy = pending || fetchStatus === 'fetching'

  const fieldError = (key: 'identifier' | 'password' | 'code') => {
    const error = errors.fields[key]
    return error ? clerkMessage(error) : null
  }
  const globalError = errors.global?.[0] ? clerkMessage(errors.global[0]) : null

  async function run(task: () => Promise<void>) {
    if (busy) return
    setPending(true)
    setProblem(null)
    try {
      await task()
    } catch (error) {
      setProblem(clerkMessage(error, 'Could not reach the sign-in service. Check your connection and try again.'))
    } finally {
      setPending(false)
    }
  }

  /** Returns true when the call succeeded; otherwise shows the error (unless it is a field error). */
  function ok(result: { error: unknown }): boolean {
    if (!result.error) return true
    if (!isFieldError(result.error)) setProblem(clerkMessage(result.error))
    return false
  }

  async function finish() {
    const result = await signIn.finalize({
      navigate: async ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setProblem('Your account needs extra setup before it can be used here. Contact an administrator.')
          return
        }
        const url = decorateUrl(destination)
        if (url.startsWith('http')) window.location.href = url
        else navigate(url, { replace: true })
      },
    })
    ok(result)
  }

  async function startSecondFactor() {
    const available = new Set(signIn.supportedSecondFactors.map((f) => f.strategy as string))
    // Device verification (client trust) is answered with an e-mailed code; real 2FA prefers an app.
    const order: SecondFactor[] =
      signIn.status === 'needs_client_trust' ? ['email_code', 'phone_code', 'totp'] : ['totp', 'phone_code', 'email_code', 'backup_code']
    const next = order.find((strategy) => available.has(strategy))
    if (!next) {
      setProblem('This account needs a verification method this app does not support. Contact an administrator.')
      return
    }
    if (next === 'email_code' && !ok(await signIn.mfa.sendEmailCode())) return
    if (next === 'phone_code' && !ok(await signIn.mfa.sendPhoneCode())) return
    if (next === 'email_code' || next === 'phone_code') startCooldown()
    setFactor(next)
    setCode('')
    setStep('second-factor')
  }

  /** Move on according to Clerk's sign-in status. */
  async function advance() {
    switch (signIn.status) {
      case 'complete':
        return finish()
      case 'needs_second_factor':
      case 'needs_client_trust':
        return startSecondFactor()
      case 'needs_new_password':
        setNewPassword('')
        setStep('new-password')
        return
      default:
        setProblem('Sign-in could not be completed. Try again or contact an administrator.')
    }
  }

  async function startOver() {
    await signIn.reset()
    setStep('credentials')
    setCode('')
    setPassword('')
    setNewPassword('')
    setProblem(null)
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (ok(await signIn.password({ emailAddress: email.trim(), password }))) await advance()
    })
  }

  const sendEmailCode = () => {
    if (!email.trim()) {
      setProblem('Enter your e-mail address first.')
      return
    }
    void run(async () => {
      if (!ok(await signIn.emailCode.sendCode({ emailAddress: email.trim() }))) return
      startCooldown()
      setCode('')
      setStep('email-code')
    })
  }

  const verifyEmailCode = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (ok(await signIn.emailCode.verifyCode({ code: code.trim() }))) await advance()
    })
  }

  const verifySecondFactor = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const params = { code: code.trim() }
      const result =
        factor === 'totp'
          ? await signIn.mfa.verifyTOTP(params)
          : factor === 'phone_code'
            ? await signIn.mfa.verifyPhoneCode(params)
            : factor === 'email_code'
              ? await signIn.mfa.verifyEmailCode(params)
              : await signIn.mfa.verifyBackupCode(params)
      if (ok(result)) await advance()
    })
  }

  const resendSecondFactor = () =>
    void run(async () => {
      const result = factor === 'phone_code' ? await signIn.mfa.sendPhoneCode() : await signIn.mfa.sendEmailCode()
      if (ok(result)) startCooldown()
    })

  const requestReset = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (!ok(await signIn.create({ identifier: email.trim() }))) return
      if (!ok(await signIn.resetPasswordEmailCode.sendCode())) return
      startCooldown()
      setCode('')
      setStep('reset-code')
    })
  }

  const verifyReset = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (!ok(await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }))) return
      setNewPassword('')
      setStep('new-password')
    })
  }

  const submitNewPassword = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (ok(await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword, signOutOfOtherSessions: true }))) await advance()
    })
  }

  const alert = (problem ?? globalError) && <FormAlert>{problem ?? globalError}</FormAlert>

  const back = (
    <button type="button" onClick={() => void startOver()} className={`${outlineButton} w-full`}>
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> Back to sign in
    </button>
  )

  const resend = (onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={busy || cooldown > 0} className={ghostButton}>
      {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
    </button>
  )

  if (step === 'email-code') {
    return (
      <form onSubmit={verifyEmailCode} className="space-y-5" noValidate>
        <Heading title="Check your e-mail" arabic="تحقق من بريدك الإلكتروني">
          We sent a sign-in code to <strong className="text-ink">{email}</strong>.
        </Heading>
        {alert}
        <CodeField label="Sign-in code" value={code} onChange={(e) => setCode(e.target.value)} error={fieldError('code')} autoFocus required />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
        <div className="flex justify-center">{resend(sendEmailCode)}</div>
        {back}
      </form>
    )
  }

  if (step === 'second-factor') {
    const copy = SECOND_FACTOR_COPY[factor]
    const canUseBackup = factor === 'totp' && signIn.supportedSecondFactors.some((f) => f.strategy === 'backup_code')
    return (
      <form onSubmit={verifySecondFactor} className="space-y-5" noValidate>
        <Heading title={copy.title} arabic="التحقق بخطوتين">
          {copy.body}
        </Heading>
        {alert}
        <CodeField
          key={factor}
          label={copy.label}
          numeric={copy.numeric}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={fieldError('code')}
          autoFocus
          required
        />
        <SubmitButton busy={busy}>Verify</SubmitButton>
        <div className="flex flex-wrap justify-center gap-x-4">
          {(factor === 'email_code' || factor === 'phone_code') && resend(resendSecondFactor)}
          {canUseBackup && (
            <button
              type="button"
              className={ghostButton}
              onClick={() => {
                setFactor('backup_code')
                setCode('')
              }}
            >
              Use a backup code instead
            </button>
          )}
        </div>
        {back}
      </form>
    )
  }

  if (step === 'reset-request') {
    return (
      <form onSubmit={requestReset} className="space-y-5" noValidate>
        <Heading title="Reset your password" arabic="إعادة تعيين كلمة المرور">
          Enter your work e-mail and we’ll send you a reset code.
        </Heading>
        {alert}
        <TextField
          label="E-mail"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError('identifier')}
          autoFocus
          required
        />
        <SubmitButton busy={busy}>Send reset code</SubmitButton>
        {back}
      </form>
    )
  }

  if (step === 'reset-code') {
    return (
      <form onSubmit={verifyReset} className="space-y-5" noValidate>
        <Heading title="Enter the reset code" arabic="أدخل رمز إعادة التعيين">
          We sent a code to <strong className="text-ink">{email}</strong>.
        </Heading>
        {alert}
        <CodeField label="Reset code" value={code} onChange={(e) => setCode(e.target.value)} error={fieldError('code')} autoFocus required />
        <SubmitButton busy={busy}>Continue</SubmitButton>
        <div className="flex justify-center">
          {resend(() =>
            void run(async () => {
              if (ok(await signIn.resetPasswordEmailCode.sendCode())) startCooldown()
            }),
          )}
        </div>
        {back}
      </form>
    )
  }

  if (step === 'new-password') {
    return (
      <form onSubmit={submitNewPassword} className="space-y-5" noValidate>
        <Heading title="Choose a new password" arabic="اختر كلمة مرور جديدة">
          You will be signed out on your other devices.
        </Heading>
        {alert}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={fieldError('password')}
          autoFocus
          required
        />
        <SubmitButton busy={busy}>Save and sign in</SubmitButton>
        {back}
      </form>
    )
  }

  return (
    <div className="space-y-5">
      <Heading title="Staff sign in" arabic="تسجيل دخول الموظفين">
        Sign in with your work account to look up products and prices.
      </Heading>
      {alert}
      <form onSubmit={submitPassword} className="space-y-5" noValidate>
        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError('identifier')}
          autoFocus
          required
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError('password')}
          required
          action={
            <button
              type="button"
              className={`${ghostButton} min-h-0 text-xs`}
              onClick={() => {
                setProblem(null)
                setStep('reset-request')
              }}
            >
              Forgot password?
            </button>
          }
        />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs font-bold text-muted uppercase" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <button type="button" onClick={sendEmailCode} disabled={busy} className={`${outlineButton} w-full`}>
        <Mail className="size-4" aria-hidden /> E-mail me a sign-in code
      </button>

      {signUpEnabled && (
        <p className="text-center text-sm text-muted">
          New to the team?{' '}
          <Link to="/sign-up" className="font-bold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">
            Create an account
          </Link>
        </p>
      )}
    </div>
  )
}
