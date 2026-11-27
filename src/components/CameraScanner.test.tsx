import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraScanner } from './CameraScanner'

type Status = { state: PermissionState; onchange: (() => void) | null }

const notAllowed = () => Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
let getUserMedia: ReturnType<typeof vi.fn>
let status: Status

function install(options: { permissions?: boolean; state?: PermissionState }) {
  status = { state: options.state ?? 'prompt', onchange: null }
  getUserMedia = vi.fn(async () => {
    throw notAllowed()
  })
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices: vi.fn(async () => []) },
    configurable: true,
  })
  Object.defineProperty(navigator, 'permissions', {
    value: options.permissions === false ? undefined : { query: vi.fn(async () => status) },
    configurable: true,
  })
}

const renderScanner = () => render(<CameraScanner paused={false} onDetected={() => undefined} />)

describe('CameraScanner permission flow', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('explains first, asks only after the button, and shows clear steps when the user refuses', async () => {
    install({ state: 'prompt' })
    const user = userEvent.setup()
    renderScanner()
    const allow = await screen.findByRole('button', { name: /السماح باستخدام الكاميرا/ })
    expect(getUserMedia).not.toHaveBeenCalled()

    await user.click(allow)
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }))
    expect(await screen.findByRole('heading', { name: 'الكاميرا محظورة لهذا الموقع' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /إعادة تحميل الصفحة/ })).toBeInTheDocument()
  })

  it('shows the help straight away when the camera is already blocked, and starts by itself once re-allowed', async () => {
    install({ state: 'denied' })
    renderScanner()
    expect(await screen.findByRole('heading', { name: 'الكاميرا محظورة لهذا الموقع' })).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()

    // The user changes the site setting to "Allow" — the browser reports it, the camera starts.
    getUserMedia.mockImplementation(() => new Promise(() => undefined))
    act(() => {
      status.state = 'granted'
      status.onchange?.()
    })
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
  })

  it('asks again from the help card with "إعادة المحاولة"', async () => {
    install({ state: 'denied' })
    const user = userEvent.setup()
    renderScanner()
    await user.click(await screen.findByRole('button', { name: /إعادة المحاولة/ }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
  })

  it('shows the explanation when the browser has no Permissions API', async () => {
    install({ permissions: false })
    renderScanner()
    expect(await screen.findByRole('button', { name: /السماح باستخدام الكاميرا/ })).toBeInTheDocument()
  })

  it('starts directly (no extra tap) when the camera was allowed before', async () => {
    install({ permissions: false })
    localStorage.setItem('scanner.cameraGranted', '1')
    getUserMedia.mockImplementation(() => new Promise(() => undefined))
    renderScanner()
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: /السماح باستخدام الكاميرا/ })).not.toBeInTheDocument()
  })
})
