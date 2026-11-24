import { useEffect, useState } from 'react'
import { isAbortError, type ApiClient } from '../lib/api'

/**
 * Loads a product image through the authenticated backend (ERPNext is never contacted directly)
 * and exposes it as an object URL, revoked on change/unmount.
 */
export function useProductImage(api: Pick<ApiClient, 'image'>, itemCode: string | null, hasImage: boolean) {
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!itemCode || !hasImage) return
    const abort = new AbortController()
    let objectUrl: string | null = null
    api
      .image(itemCode, abort.signal)
      .then((blob) => {
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setResult({ key: itemCode, url: objectUrl })
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setResult({ key: itemCode, url: null })
      })
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [api, itemCode, hasImage])

  if (!itemCode || !hasImage) return { status: 'none' as const, url: null }
  if (result?.key !== itemCode) return { status: 'loading' as const, url: null }
  return result.url ? { status: 'loaded' as const, url: result.url } : { status: 'none' as const, url: null }
}
