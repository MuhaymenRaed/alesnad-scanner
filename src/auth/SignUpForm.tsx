import { useSignUp } from '@clerk/react'
import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ghostButton, outlineButton } from '../components/ui'
import { clerkMessage, isFieldError } from './clerkErrors'
import { CodeField, FormAlert, PasswordField, SubmitButton, TextField } from './FormBits'
import { useCooldown } from './useCooldown'

/**
 * Custom sign-up (only routed when VITE_ENABLE_SIGN_UP=true): name, e-mail and password, then an
 * e-mailed verification code. Clerk's Dashboard still decides whether sign-ups are allowed —
 * in "Restricted" mode only invited addresses succeed.
 */
export function SignUpForm({ destination }: { destination: string }) {
  const { signUp, errors, fetchStatus } = useSignUp()
  const navigate = useNavigate()
  const [verifying, setVerifying] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()
  const busy = pending || fetchStatus === 'fetching'

  const fieldError = (key: 'firstName' | 'lastName' | 'emailAddress' | 'password' | 'code') => {
    const fields = errors.fields as unknown as Record<string, unknown>
    return fields[key] ? clerkMessage(fields[key]) : null
  }

  async function run(task: () => Promise<void>) {
    if (busy) return
    setPending(true)
    setProblem(null)
    try {
      await task()
    } catch (error) {
      setProblem(clerkMessage(error, 'Could not reach the sign-up service. Check your connection and try again.'))
    } finally {
      setPending(false)
    }
  }

  function ok(result: { error: unknown }): boolean {
    if (!result.error) return true
    if (!isFieldError(result.error)) setProblem(clerkMessage(result.error))
    return false
  }

  const submitDetails = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (!ok(await signUp.password({ emailAddress: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() }))) return
      if (!ok(await signUp.verifications.sendEmailCode())) return
      startCooldown()
      setVerifying(true)
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (!ok(await signUp.verifications.verifyEmailCode({ code: code.trim() }))) return
      if (signUp.status !== 'complete') {
        setProblem('Your account needs more information before it can be used. Contact an administrator.')
        return
      }
      ok(
        await signUp.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              setProblem('Your account needs extra setup before it can be used here. Contact an administrator.')
              return
            }
            const url = decorateUrl(destination)
            if (url.startsWith('http')) window.location.href = url
            else navigate(url, { replace: true })
          },
        }),
      )
    })
  }

  const alert = problem && <FormAlert>{problem}</FormAlert>

  if (verifying) {
    return (
      <form onSubmit={verify} className="space-y-5" noValidate>
        <div className="mb-6">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.03em]">Verify your e-mail</h1>
          <p className="mt-2 text-sm text-muted">
            We sent a code to <strong className="text-ink">{email}</strong>.
          </p>
        </div>
        {alert}
        <CodeField label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} error={fieldError('code')} autoFocus required />
        <SubmitButton busy={busy}>Verify and continue</SubmitButton>
        <div className="flex justify-center">
          <button
            type="button"
            disabled={busy || cooldown > 0}
            className={ghostButton}
            onClick={() =>
              void run(async () => {
                if (ok(await signUp.verifications.sendEmailCode())) startCooldown()
              })
            }
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </button>
        </div>
        <button type="button" onClick={() => setVerifying(false)} className={`${outlineButton} w-full`}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> Back
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitDetails} className="space-y-5" noValidate>
      <div className="mb-6">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.03em]">Create your account</h1>
        <p lang="ar" dir="rtl" className="mt-0.5 text-left text-lg font-semibold text-muted">
          إنشاء حساب موظف
        </p>
      </div>
      {alert}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} error={fieldError('firstName')} autoFocus />
        <TextField label="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} error={fieldError('lastName')} />
      </div>
      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError('emailAddress')}
        required
      />
      <PasswordField label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError('password')} required />
      {/* Clerk's bot protection renders its challenge here when enabled. */}
      <div id="clerk-captcha" />
      <SubmitButton busy={busy}>Create account</SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-bold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">
          Sign in
        </Link>
      </p>
    </form>
  )
}
