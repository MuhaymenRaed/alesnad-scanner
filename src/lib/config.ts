/**
 * Public, build-time frontend settings. Self-registration is OFF unless explicitly enabled —
 * staff accounts are normally created by invitation from the Clerk Dashboard.
 */
export const signUpEnabled = import.meta.env.VITE_ENABLE_SIGN_UP === 'true'
