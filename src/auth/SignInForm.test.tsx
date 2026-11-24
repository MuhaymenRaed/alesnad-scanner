import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInForm } from './SignInForm'

type Result = Promise<{ error: unknown }>
const ok = async () => ({ error: null })

/** A scripted stand-in for Clerk's SignInFuture resource. */
function createFakeSignIn() {
  const signIn = {
    status: 'needs_identifier' as string,
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    password: vi.fn(async (): Result => {
      signIn.status = 'complete'
      return { error: null }
    }),
    create: vi.fn(ok),
    reset: vi.fn(async () => {
      signIn.status = 'needs_identifier'
      return { error: null }
    }),
    finalize: vi.fn(async (params: { navigate: (p: { session: object; decorateUrl: (u: string) => string }) => Promise<void> }) => {
      await params.navigate({ session: {}, decorateUrl: (url: string) => url })
      return { error: null }
    }),
    emailCode: { sendCode: vi.fn(ok), verifyCode: vi.fn(ok) },
    mfa: {
      sendEmailCode: vi.fn(ok),
      sendPhoneCode: vi.fn(ok),
      verifyEmailCode: vi.fn(async (): Result => {
        signIn.status = 'complete'
        return { error: null }
      }),
      verifyPhoneCode: vi.fn(ok),
      verifyTOTP: vi.fn(ok),
      verifyBackupCode: vi.fn(ok),
    },
    resetPasswordEmailCode: {
      sendCode: vi.fn(ok),
      verifyCode: vi.fn(async (): Result => {
        signIn.status = 'needs_new_password'
        return { error: null }
      }),
      submitPassword: vi.fn(async (): Result => {
        signIn.status = 'complete'
        return { error: null }
      }),
    },
  }
  return signIn
}

const hook = vi.hoisted(() => ({
  current: {} as { signIn: unknown; errors: { fields: Record<string, unknown>; global: unknown; raw: unknown }; fetchStatus: string },
}))
vi.mock('@clerk/react', () => ({ useSignIn: () => hook.current }))

let signIn: ReturnType<typeof createFakeSignIn>

function renderForm() {
  render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <Routes>
        <Route path="/sign-in" element={<SignInForm destination="/?from=test" />} />
        <Route path="/" element={<p>Scanner home</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SignInForm (custom Clerk flow)', () => {
  beforeEach(() => {
    signIn = createFakeSignIn()
    hook.current = { signIn, errors: { fields: { identifier: null, password: null, code: null }, global: null, raw: null }, fetchStatus: 'idle' }
  })

  it('signs in with e-mail and password and goes to the remembered destination', async () => {
    const user = renderForm()
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('E-mail'), 'staff@alisnad.iq')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn.password).toHaveBeenCalledWith({ emailAddress: 'staff@alisnad.iq', password: 'secret-pass' })
    expect(signIn.finalize).toHaveBeenCalled()
    expect(await screen.findByText('Scanner home')).toBeInTheDocument()
  })

  it('shows field errors next to the field and other errors in a banner', async () => {
    signIn.password.mockResolvedValueOnce({ error: { errors: [{ message: 'x', meta: { paramName: 'password' } }] } })
    hook.current.errors.fields.password = { code: 'form_password_incorrect', message: 'Password is incorrect. Try again.' }
    const user = renderForm()
    await user.type(screen.getByLabelText('E-mail'), 'staff@alisnad.iq')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Password is incorrect. Try again.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')

    signIn.password.mockResolvedValueOnce({ error: { errors: [{ longMessage: 'Too many attempts. Try again later.' }] } })
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again later.')
    expect(signIn.finalize).not.toHaveBeenCalled()
  })

  it('verifies a new device with an e-mailed code (needs_client_trust)', async () => {
    signIn.password.mockImplementationOnce(async () => {
      signIn.status = 'needs_client_trust'
      signIn.supportedSecondFactors = [{ strategy: 'email_code' }]
      return { error: null }
    })
    const user = renderForm()
    await user.type(screen.getByLabelText('E-mail'), 'staff@alisnad.iq')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn.mfa.sendEmailCode).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Confirm it’s you' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Code from e-mail'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' })
    expect(await screen.findByText('Scanner home')).toBeInTheDocument()
  })

  it('resets a forgotten password with an e-mailed code', async () => {
    const user = renderForm()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await user.type(screen.getByLabelText('E-mail'), 'staff@alisnad.iq')
    await user.click(screen.getByRole('button', { name: 'Send reset code' }))
    expect(signIn.create).toHaveBeenCalledWith({ identifier: 'staff@alisnad.iq' })
    expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalled()

    await user.type(screen.getByLabelText('Reset code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('New password'), 'a-new-strong-password')
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }))
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({ password: 'a-new-strong-password', signOutOfOtherSessions: true })
    expect(await screen.findByText('Scanner home')).toBeInTheDocument()
  })

  it('asks for the e-mail before sending a sign-in code', async () => {
    const user = renderForm()
    await user.click(screen.getByRole('button', { name: /E-mail me a sign-in code/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your e-mail address first.')
    expect(signIn.emailCode.sendCode).not.toHaveBeenCalled()
  })
})
