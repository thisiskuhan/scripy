export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_SCOPES = `openid email profile ${DRIVE_SCOPE}`

export interface GoogleSession {
  accessToken: string
  expiresAt: number
  user: { id: string; email: string; name: string }
}

export interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
}

export async function verifyGoogleSession(token: GoogleTokenResponse): Promise<GoogleSession> {
  if (token.error || !token.access_token)
    throw new Error('Google sign-in was cancelled or denied. Please try again.')
  const scopes = new Set(token.scope?.split(/\s+/))
  if (!scopes.has('openid')) throw new Error('Google did not grant access to your account identity.')
  if (!scopes.has(DRIVE_SCOPE)) throw new Error('Allow access to Scripy files in Google Drive to continue.')
  const lifetime = Number(token.expires_in)
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 86400)
    throw new Error('Google returned an invalid session. Please sign in again.')
  const expiresAt = Date.now() + lifetime * 1000
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error('Your Google account could not be verified. Please sign in again.')
  const user: unknown = await response.json()
  if (
    !user ||
    typeof user !== 'object' ||
    !('sub' in user) ||
    typeof user.sub !== 'string' ||
    !user.sub ||
    !('email' in user) ||
    typeof user.email !== 'string' ||
    !user.email ||
    !('email_verified' in user) ||
    user.email_verified !== true ||
    expiresAt <= Date.now()
  )
    throw new Error('Google did not return a verified account. Please try another account.')
  return {
    accessToken: token.access_token,
    expiresAt,
    user: {
      id: user.sub,
      email: user.email,
      name: 'name' in user && typeof user.name === 'string' ? user.name : user.email,
    },
  }
}
