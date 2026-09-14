import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRIVE_SCOPE, GOOGLE_SCOPES, verifyGoogleSession } from './google-auth'

afterEach(() => vi.unstubAllGlobals())

describe('Google session verification', () => {
  const token = { access_token: 'test-token', expires_in: 3600, scope: GOOGLE_SCOPES }

  it('accepts only a Google-verified account with file-scoped Drive consent', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ sub: 'writer-1', email: 'writer@example.com', email_verified: true, name: 'Writer' }),
      )
    vi.stubGlobal('fetch', request)
    const session = await verifyGoogleSession(token)
    expect(session.user).toEqual({ id: 'writer-1', email: 'writer@example.com', name: 'Writer' })
    expect(session.expiresAt).toBeGreaterThan(Date.now())
    expect(request).toHaveBeenCalledWith(
      'https://openidconnect.googleapis.com/v1/userinfo',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' }, cache: 'no-store' }),
    )
    expect(GOOGLE_SCOPES.split(' ')).toContain(DRIVE_SCOPE)
    expect(GOOGLE_SCOPES.split(' ')).not.toContain('https://www.googleapis.com/auth/drive')
  })

  it('does not accept a cancelled sign-in', async () => {
    await expect(verifyGoogleSession({ error: 'access_denied' })).rejects.toThrow('cancelled or denied')
  })

  it('does not open a session without Drive permission', async () => {
    await expect(verifyGoogleSession({ ...token, scope: 'openid email profile' })).rejects.toThrow(
      'Allow access to Scripy files',
    )
  })

  it.each([0, -1, NaN, Infinity, 999999])('rejects invalid token lifetime %s', async (expires_in) => {
    await expect(verifyGoogleSession({ ...token, expires_in })).rejects.toThrow('invalid session')
  })

  it('rejects a token that Google no longer accepts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(verifyGoogleSession(token)).rejects.toThrow('could not be verified')
  })

  it.each([null, {}, { sub: 'other', email: 'other@example.com', email_verified: false }])(
    'rejects an incomplete or unverified account',
    async (user) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(user)))
      await expect(verifyGoogleSession(token)).rejects.toThrow('verified account')
    },
  )
})
