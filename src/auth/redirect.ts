/**
 * Only same-origin app paths are accepted as post-sign-in destinations (prevents open redirects
 * such as ?redirect_url=https://evil.example or //evil.example).
 */
export function safeRedirectPath(value: string | null | undefined, origin = window.location.origin): string {
  if (!value) return '/'
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin) return '/'
    if (url.pathname.startsWith('/sign-in')) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function signInPathFor(destination: string): string {
  return destination === '/' ? '/sign-in' : `/sign-in?redirect_url=${encodeURIComponent(destination)}`
}
