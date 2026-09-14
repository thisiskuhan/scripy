import type { GoogleSession } from './google-auth'
import { MAX_FILE_BYTES, parseProject, serializeProject, scripyFileName, type Screenplay } from './screenplay'

export interface DriveCopy {
  id: string
  name: string
  size: number
  modifiedTime: string
}

function readCopy(value: unknown): DriveCopy {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !/^[\w-]+$/.test(value.id) ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('modifiedTime' in value) ||
    typeof value.modifiedTime !== 'string' ||
    !Number.isFinite(Date.parse(value.modifiedTime)) ||
    !('size' in value) ||
    !Number.isFinite(Number(value.size)) ||
    Number(value.size) < 0
  )
    throw new Error('Google Drive returned an invalid file listing. Please try again.')
  return { id: value.id, name: value.name, size: Number(value.size), modifiedTime: value.modifiedTime }
}

export function createGoogleDrive(session: GoogleSession, onExpired: () => void) {
  async function request(url: string, options: RequestInit = {}) {
    if (Date.now() >= session.expiresAt) {
      onExpired()
      throw new Error('Your Google session expired. Sign in again to access Drive.')
    }
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${session.accessToken}`)
    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(30000),
      })
    } catch {
      throw new Error('Google Drive could not be reached. Your local draft is unchanged; please try again.')
    }
    if (response.status === 401) {
      onExpired()
      throw new Error('Google Drive requires you to sign in again. Your local recovery is retained.')
    }
    if (response.status === 403)
      throw new Error('Google Drive denied access. Check your Drive permission and available storage.')
    if (response.status === 404) throw new Error('This file is no longer available in Google Drive.')
    if (!response.ok)
      throw new Error(
        'Google Drive could not complete the request. Your local draft is unchanged; please try again.',
      )
    return response
  }

  async function saveCopy(project: Screenplay): Promise<DriveCopy> {
    const content = serializeProject(project)
    const boundary = `scripy-${crypto.randomUUID()}`
    const metadata = {
      name: scripyFileName(project.title),
      mimeType: 'application/json',
      appProperties: { application: 'scripy', projectId: project.id },
    }
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        content,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    )
    const response = await request(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime',
      {
        method: 'POST',
        body,
      },
    )
    return readCopy(await response.json())
  }

  async function listCopies(pageToken?: string): Promise<{ files: DriveCopy[]; nextPageToken?: string }> {
    const parameters = new URLSearchParams({
      q: "trashed = false and appProperties has { key='application' and value='scripy' }",
      spaces: 'drive',
      pageSize: '100',
      orderBy: 'modifiedTime desc',
      fields: 'nextPageToken,files(id,name,size,modifiedTime)',
    })
    if (pageToken) parameters.set('pageToken', pageToken)
    const response = await request(`https://www.googleapis.com/drive/v3/files?${parameters}`)
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('files' in result) || !Array.isArray(result.files))
      throw new Error('Google Drive returned an invalid file listing. Please try again.')
    return {
      files: result.files.map(readCopy),
      nextPageToken:
        'nextPageToken' in result && typeof result.nextPageToken === 'string'
          ? result.nextPageToken
          : undefined,
    }
  }

  async function openCopy(copy: DriveCopy): Promise<Screenplay> {
    if (!/^[\w-]+$/.test(copy.id)) throw new Error('Invalid Google Drive file.')
    if (copy.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 5 MB document limit.')
    const response = await request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copy.id)}?alt=media`,
    )
    if (Number(response.headers.get('content-length')) > MAX_FILE_BYTES)
      throw new Error('This file exceeds the 5 MB document limit.')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('This file exceeds the 5 MB document limit.')
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('This Google Drive file is not valid UTF-8 text.')
    }
    return parseProject(text)
  }

  return { saveCopy, listCopies, openCopy }
}

export type GoogleDrive = ReturnType<typeof createGoogleDrive>
