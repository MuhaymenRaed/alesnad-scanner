import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '../components/ThemeToggle'
import { applySavedTheme, THEME_STORAGE_KEY } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('is light by default (the system setting is not used)', () => {
    applySavedTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('restores the saved choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    applySavedTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggles between light and dark and remembers the choice', async () => {
    applySavedTheme()
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'التبديل إلى الوضع الداكن' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'التبديل إلى الوضع الفاتح' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
