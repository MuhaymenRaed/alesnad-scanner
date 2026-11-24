import { useAuth } from '@clerk/react'
import { useMemo } from 'react'
import { createApiClient, type ApiClient } from '../lib/api'

/** API client bound to the current Clerk session (`getToken` always yields a fresh, short-lived token). */
export function useApiClient(): ApiClient {
  const { getToken } = useAuth()
  return useMemo(() => createApiClient((options) => getToken(options)), [getToken])
}
