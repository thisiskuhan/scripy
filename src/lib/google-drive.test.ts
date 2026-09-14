import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGoogleDrive } from './google-drive'
import { createScreenplay, MAX_FILE_BYTES, serializeProject } from './screenplay'

afterEach(() => vi.unstubAllGlobals())

describe('Google Drive copies', () => {
  const session = () => ({
    accessToken: 'drive-test-token',
    expiresAt: Date.now() + 3600000,
    user: { id: 'writer', email: 'writer@example.com', name: 'Writer' },
  })
  const copy = {
    id: 'drive-copy',
    name: 'Script.scripy',
    size: 512,
    modifiedTime: '2026-09-14T12:00:00.000Z',
  }

  it('creates a timestamped .scripy copy without overwriting existing Drive files', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ ...copy, size: String(copy.size) }))
    vi.stubGlobal('fetch', request)
    const project = createScreenplay('A New Scene')
    await createGoogleDrive(session(), vi.fn()).saveCopy(project)
    const [url, options] = request.mock.calls[0]
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(options.method).toBe('POST')
    expect(options.headers.get('Authorization')).toBe('Bearer drive-test-token')
    expect(options.credentials).toBe('omit')
    const body = await options.body.text()
    expect(options.body.type).toContain('multipart/related')
    expect(body).toMatch(/A New Scene_.*\.scripy/)
    expect(body).toContain('"application":"scripy"')
    expect(body).toContain(serializeProject(project))
  })

  it('lists only app-created files and preserves Drive pagination', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ files: [copy], nextPageToken: 'next' }))
    vi.stubGlobal('fetch', request)
    const result = await createGoogleDrive(session(), vi.fn()).listCopies('previous')
    expect(result).toEqual({ files: [copy], nextPageToken: 'next' })
    const url = new URL(request.mock.calls[0][0])
    expect(url.searchParams.get('q')).toContain("key='application' and value='scripy'")
    expect(url.searchParams.get('pageToken')).toBe('previous')
  })

  it('validates downloaded screenplay data before opening it', async () => {
    const project = createScreenplay('From Drive')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(serializeProject(project))))
    expect((await createGoogleDrive(session(), vi.fn()).openCopy(copy)).title).toBe('From Drive')
  })

  it('rejects malformed files without accepting a replacement draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{')))
    await expect(createGoogleDrive(session(), vi.fn()).openCopy(copy)).rejects.toThrow('not valid JSON')
  })

  it('rejects oversized files before downloading', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(
      createGoogleDrive(session(), vi.fn()).openCopy({ ...copy, size: MAX_FILE_BYTES + 1 }),
    ).rejects.toThrow('5 MB')
    expect(request).not.toHaveBeenCalled()
  })

  it('locks the web session when Google rejects the token', async () => {
    const expired = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(createGoogleDrive(session(), expired).listCopies()).rejects.toThrow('sign in again')
    expect(expired).toHaveBeenCalledOnce()
  })

  it('rejects expired sessions without sending a request', async () => {
    const expired = vi.fn()
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(
      createGoogleDrive({ ...session(), expiresAt: Date.now() - 1 }, expired).listCopies(),
    ).rejects.toThrow('expired')
    expect(expired).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
  })
})
