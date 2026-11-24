/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key (public). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  /** Optional absolute backend URL when the API is on another origin; default is same-origin /api. */
  readonly VITE_API_BASE_URL?: string
  /** "true" to show the custom sign-up page (off by default: staff are invited). */
  readonly VITE_ENABLE_SIGN_UP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
