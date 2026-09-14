import { GoogleOAuthProvider, googleLogout, useGoogleLogin, useGoogleOAuth } from '@react-oauth/google'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GOOGLE_CLIENT_ID } from '../lib/deployment'
import { DRIVE_SCOPE, verifyGoogleSession, type GoogleSession } from '../lib/google-auth'
import type { Appearance } from '../lib/useTheme'
import { HomePageLayout } from './HomePage'

interface Props {
  appearance: Appearance
  children(session: GoogleSession, signOut: () => void, expire: () => void): ReactNode
}

function GoogleSessionGate({ appearance, children, scriptError }: Props & { scriptError: string }) {
  const { scriptLoadedSuccessfully } = useGoogleOAuth()
  const [session, setSession] = useState<GoogleSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const attempt = useRef(0)
  const pending = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      attempt.current += 1
    }
  }, [])
  useEffect(() => {
    if (scriptLoadedSuccessfully) return
    const timer = window.setTimeout(() => setTimedOut(true), 15000)
    return () => window.clearTimeout(timer)
  }, [scriptLoadedSuccessfully])

  function fail(message: string) {
    pending.current = false
    if (!mounted.current) return
    setBusy(false)
    setError(message)
  }

  const login = useGoogleLogin({
    scope: DRIVE_SCOPE,
    prompt: 'select_account',
    onSuccess: async (token) => {
      const request = attempt.current
      try {
        const verified = await verifyGoogleSession(token)
        if (!mounted.current || request !== attempt.current) return
        setSession(verified)
        setError('')
      } catch (reason) {
        if (request === attempt.current)
          fail(reason instanceof Error ? reason.message : 'Google sign-in failed. Please try again.')
      } finally {
        if (mounted.current && request === attempt.current) {
          pending.current = false
          setBusy(false)
        }
      }
    },
    onError: () => fail('Google sign-in was cancelled or denied. Please try again.'),
    onNonOAuthError: (reason) =>
      fail(
        reason.type === 'popup_failed_to_open'
          ? 'Allow the Google sign-in popup, then try again.'
          : 'The Google sign-in window was closed. Please try again.',
      ),
  })

  function expire() {
    attempt.current += 1
    pending.current = false
    setBusy(false)
    setSession(null)
    setError('Your Google session expired. Sign in again; your local recovery is retained.')
  }

  useEffect(() => {
    if (!session) return
    const check = () => {
      if (Date.now() >= session.expiresAt) expire()
    }
    const timer = window.setTimeout(check, Math.max(0, session.expiresAt - Date.now()))
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [session])

  if (session)
    return children(
      session,
      () => {
        attempt.current += 1
        googleLogout()
        setSession(null)
        setError('')
      },
      expire,
    )

  return (
    <HomePageLayout
      appearance={appearance}
      busy={busy}
      loading={!scriptLoadedSuccessfully && !scriptError && !timedOut}
      error={
        error ||
        scriptError ||
        (timedOut && !scriptLoadedSuccessfully
          ? 'Google sign-in could not load. Check your connection and try again.'
          : '')
      }
      onSignIn={() => {
        if (!scriptLoadedSuccessfully) {
          window.location.reload()
          return
        }
        if (pending.current) return
        attempt.current += 1
        pending.current = true
        setBusy(true)
        setError('')
        try {
          login()
        } catch {
          fail('Google sign-in could not start. Please try again.')
        }
      }}
    />
  )
}

export function BrowserSession({ appearance, children }: Props) {
  const [error, setError] = useState('')
  if (!GOOGLE_CLIENT_ID)
    return (
      <HomePageLayout
        appearance={appearance}
        error={error}
        onSignIn={() => setError('Google sign-in is not configured for this deployment yet.')}
      />
    )
  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID}
      onScriptLoadError={() =>
        setError('Google sign-in could not load. Check your connection and try again.')
      }
    >
      <GoogleSessionGate appearance={appearance} scriptError={error}>
        {children}
      </GoogleSessionGate>
    </GoogleOAuthProvider>
  )
}
