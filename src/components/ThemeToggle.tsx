import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

/** Light/dark switch. `onDark` for the charcoal header bars, `onLight` for light surfaces. */
export function ThemeToggle({ tone = 'onDark' }: { tone?: 'onDark' | 'onLight' }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${
        tone === 'onDark' ? 'text-white hover:bg-white/10' : 'border border-line bg-surface text-ink hover:bg-subtle'
      }`}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}
