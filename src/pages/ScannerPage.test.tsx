import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiResult } from '../lib/api'
import type { Product } from '../../shared/api'
import { deferred, productFixture } from '../test/fixtures'
import { ScannerPage } from './ScannerPage'

const signOut = vi.fn()
const lookup = vi.fn<(barcode: string, itemCode?: string, signal?: AbortSignal) => Promise<ApiResult<Product>>>()

vi.mock('@clerk/react', () => ({
  useClerk: () => ({ signOut }),
  useUser: () => ({ user: { fullName: 'Test User' } }),
  UserButton: () => <div data-testid="user-button" />,
}))
vi.mock('../hooks/useApiClient', () => {
  const api = { lookup: (...args: Parameters<typeof lookup>) => lookup(...args), image: async () => null, session: vi.fn() }
  return { useApiClient: () => api }
})

function renderPage() {
  render(
    <MemoryRouter>
      <ScannerPage />
    </MemoryRouter>,
  )
  return { input: screen.getByRole('textbox', { name: /^Barcode ·/ }), user: userEvent.setup() }
}

const result = () => screen.getByRole('region', { name: 'Lookup result' })

describe('ScannerPage', () => {
  beforeEach(() => {
    lookup.mockReset()
    signOut.mockReset()
  })

  it('shows the user, a focused barcode field and the idle state', () => {
    const { input } = renderPage()
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(screen.getByText('Ready to scan')).toBeInTheDocument()
  })

  it('looks up on Enter (one request, not per keystroke), shows loading, then the product and price', async () => {
    const pending = deferred<ApiResult<Product>>()
    lookup.mockReturnValue(pending.promise)
    const { input, user } = renderPage()

    await user.type(input, '0123456789012{Enter}')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith('0123456789012', undefined, expect.any(AbortSignal))
    expect(within(result()).getByText('Looking up product…')).toBeInTheDocument()

    pending.resolve({ ok: true, data: productFixture() })
    expect(await within(result()).findByRole('heading', { name: 'Example Phone' })).toBeInTheDocument()
    const price = within(result()).getByTestId('price')
    expect(price).toHaveTextContent('12.50')
    expect(price).toHaveTextContent('USD')
    expect(price).toHaveTextContent('Standard Selling')
    expect(within(result()).getByText('ITEM-0001')).toBeInTheDocument()
    expect(within(result()).getByText('Device Color')).toBeInTheDocument()
    // Ready for the next hardware scan without touching the mouse.
    expect(input).toHaveFocus()
  })

  it('shows "No price available" (never 0) when the price is missing', async () => {
    lookup.mockResolvedValue({
      ok: true,
      data: productFixture({
        sellingPrice: null,
        currency: null,
        price: { status: 'unavailable', priceList: 'Standard Selling', reason: 'NO_PRICE_IN_LIST', message: 'This item has no price in the selling price list.' },
      }),
    })
    const { input, user } = renderPage()
    await user.type(input, '1{Enter}')
    const price = await within(result()).findByTestId('price')
    expect(price).toHaveTextContent('No price available')
    expect(price).not.toHaveTextContent(/\b0(\.00)?\b/)
  })

  it('shows a clear not-found message and records it in recent scans', async () => {
    lookup.mockResolvedValue({ ok: false, status: 404, error: { code: 'ITEM_NOT_FOUND', message: 'No product was found for this barcode.' } })
    const { input, user } = renderPage()
    await user.type(input, '999{Enter}')
    expect(await within(result()).findByText('Product not found')).toBeInTheDocument()
    const recent = screen.getByRole('region', { name: /recent scans/i })
    expect(within(recent).getByText('999')).toBeInTheDocument()
    expect(within(recent).getByText(/Not found/)).toBeInTheDocument()
  })

  it('shows ERPNext outages without crashing', async () => {
    lookup.mockResolvedValue({ ok: false, status: 504, error: { code: 'ERPNEXT_TIMEOUT', message: 'x', requestId: 'req-1' } })
    const { input, user } = renderPage()
    await user.type(input, '42{Enter}')
    expect(await within(result()).findByText('ERPNext is taking too long')).toBeInTheDocument()
    expect(within(result()).getByText('Reference: req-1')).toBeInTheDocument()
  })

  it('offers sign-in again when the backend rejects the session, and signs out when the session ended', async () => {
    lookup.mockResolvedValueOnce({ ok: false, status: 401, error: { code: 'UNAUTHENTICATED', message: 'x' } })
    const { input, user } = renderPage()
    await user.type(input, '42{Enter}')
    await user.click(await within(result()).findByRole('button', { name: 'Sign in again' }))
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' })

    signOut.mockReset()
    lookup.mockResolvedValueOnce({ ok: false, status: 401, error: { code: 'SESSION_ENDED', message: 'x' } })
    await user.clear(input)
    await user.type(input, '43{Enter}')
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' }))
  })

  it('lets the user resolve an ambiguous barcode; the choice is sent for server validation', async () => {
    lookup
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: {
          code: 'AMBIGUOUS_BARCODE',
          message: 'x',
          candidates: [
            { itemCode: 'A-1', itemName: 'Alpha', itemGroup: 'Phones', disabled: false },
            { itemCode: 'B-2', itemName: 'Beta', itemGroup: 'Phones', disabled: true },
          ],
        },
      })
      .mockResolvedValueOnce({ ok: true, data: productFixture({ itemCode: 'B-2', itemName: 'Beta' }) })
    const { input, user } = renderPage()
    await user.type(input, '555{Enter}')
    await user.click(await within(result()).findByRole('button', { name: /Beta/ }))
    expect(lookup).toHaveBeenLastCalledWith('555', 'B-2', expect.any(AbortSignal))
    expect(await within(result()).findByRole('heading', { name: 'Beta' })).toBeInTheDocument()
  })

  it('redirects scanner keystrokes to the barcode field when focus is elsewhere', async () => {
    lookup.mockResolvedValue({ ok: true, data: productFixture() })
    const { input, user } = renderPage()
    input.blur()
    expect(input).not.toHaveFocus()
    await user.keyboard('7')
    expect(input).toHaveFocus()
  })
})
