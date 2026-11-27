import { useSyncExternalStore } from 'react'

/**
 * Light/dark theme chosen by the user. Light is the default (not the system setting); the choice is
 * remembered on this device. index.html applies it before first paint so there is no flash.
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'scanner.theme'
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Not persisted (private mode etc.) — still applied for this visit.
  }
  listeners.forEach((listener) => listener())
}

/** Applies the saved theme (light when nothing is saved). Safe to call more than once. */
export function applySavedTheme(): void {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    saved = null
  }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as Theme)
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
