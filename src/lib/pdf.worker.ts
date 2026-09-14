import { createPdf } from './pdf'
import type { PdfExportRequest, PdfExportResult } from './pdf-export'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PdfExportRequest>) => void) | null
  postMessage(message: PdfExportResult, transfer?: Transferable[]): void
}

scope.onmessage = async ({ data }) => {
  try {
    const output = await createPdf(data.project, data.titlePage, data.sceneNumbers, data.assetBaseUrl)
    scope.postMessage({ data: output }, [output])
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : 'PDF export failed. Please try again.',
    })
  }
}
