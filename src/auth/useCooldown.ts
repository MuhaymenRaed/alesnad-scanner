import { useEffect, useState } from 'react'

/** Seconds left before "send a new code" is allowed again. */
export function useCooldown(): [number, () => void] {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= now) return
    const timer = window.setTimeout(() => setNow(Date.now()), 1000)
    return () => window.clearTimeout(timer)
  }, [until, now])
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  return [
    left,
    () => {
      const start = Date.now()
      setNow(start)
      setUntil(start + 30_000)
    },
  ]
}
