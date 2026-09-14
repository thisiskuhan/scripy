import type { Screenplay } from './screenplay'

export interface PdfExportRequest {
  project: Screenplay
  titlePage: boolean
  sceneNumbers: boolean
  assetBaseUrl: string
}

export type PdfExportResult = { data: ArrayBuffer; error?: never } | { data?: never; error: string }

export function exportPdf(
  project: Screenplay,
  titlePage: boolean,
  sceneNumbers: boolean,
): Promise<ArrayBuffer> {
  if (import.meta.env.DEV && ['5173', '5187'].includes(location.port)) {
    return Promise.reject(
      new Error(
        'This tab is on an old Scripy address. Keep it open and save a document copy, then open http://127.0.0.1:7457/ and import that file to export.',
      ),
    )
  }
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      reject(
        new Error(
          'PDF export could not start. Check that Scripy is running, then click Export PDF again. Your draft is unchanged.',
        ),
      )
      return
    }

    const finish = (error?: Error, data?: ArrayBuffer) => {
      clearTimeout(timeout)
      worker.terminate()
      if (error) reject(error)
      else if (data) resolve(data)
    }
    const timeout = setTimeout(() => {
      finish(
        new Error(
          'PDF export timed out. Check the local server and try Export PDF again. Your draft is unchanged.',
        ),
      )
    }, 60000)

    worker.onmessage = (event: MessageEvent<PdfExportResult>) => {
      if (event.data.error) finish(new Error(event.data.error))
      else if (event.data.data instanceof ArrayBuffer) finish(undefined, event.data.data)
      else finish(new Error('PDF export returned an invalid result. Please try again.'))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish(
        new Error(
          'The PDF exporter could not be loaded. Check that the local server is running, then click Export PDF again. Your draft is unchanged.',
        ),
      )
    }
    worker.onmessageerror = () =>
      finish(new Error('PDF export could not read the document. Please try again.'))

    const request: PdfExportRequest = {
      project,
      titlePage,
      sceneNumbers,
      assetBaseUrl: new URL(import.meta.env.BASE_URL, document.baseURI).href,
    }
    try {
      worker.postMessage(request)
    } catch {
      finish(new Error('PDF export could not read the document. Please try again.'))
    }
  })
}
