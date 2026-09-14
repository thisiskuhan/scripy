import { jsPDF } from 'jspdf'
import { elementMetrics, paginate } from './layout'
import { paperMetrics } from './paper'
import { validateArtwork } from './artwork'
import type { Screenplay } from './screenplay'

let fonts: Promise<[string, string]> | undefined

async function fontData(name: string, assetBaseUrl: string): Promise<string> {
  const response = await fetch(`${assetBaseUrl}fonts/${name}.ttf`)
  if (!response.ok) throw new Error('The PDF typeface could not be loaded. Please try again.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

export async function createPdf(
  project: Screenplay,
  titlePage: boolean,
  sceneNumbers: boolean,
  assetBaseUrl = import.meta.env.BASE_URL,
): Promise<ArrayBuffer> {
  const page = paperMetrics(project.paperSize)
  const metrics = elementMetrics(project.paperSize)
  fonts ??= Promise.all([
    fontData('CourierPrime-Regular', assetBaseUrl),
    fontData('CourierPrime-Bold', assetBaseUrl),
  ]).catch((error: unknown) => {
    fonts = undefined
    throw error
  })
  const [regular, bold] = await fonts
  const pdf = new jsPDF({ unit: 'pt', format: project.paperSize, compress: true, putOnlyUsedFonts: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  pdf.addFileToVFS('CourierPrime-Regular.ttf', regular)
  pdf.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal')
  pdf.addFileToVFS('CourierPrime-Bold.ttf', bold)
  pdf.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold')
  pdf.setFont('CourierPrime', 'normal')
  pdf.setFontSize(12)
  pdf.setProperties({
    title: project.title,
    author: project.author,
    subject: project.logline,
    creator: 'Scripy',
  })
  if (titlePage) {
    const image = validateArtwork(project.titleArtwork)
    const titleTop = image ? pageHeight * 0.46 : 300
    if (image) {
      const scale = Math.min((pageWidth - 144) / image.width, 170 / image.height)
      const width = image.width * scale
      const height = image.height * scale
      try {
        pdf.addImage(image.dataUrl, 'PNG', (pageWidth - width) / 2, titleTop - height - 40, width, height)
      } catch {
        throw new Error(
          'The title-page image could not be exported. Replace or remove it in Screenplay details.',
        )
      }
    }
    pdf.setFont('CourierPrime', 'bold')
    const titleLines = pdf.splitTextToSize(project.title.toUpperCase(), pageWidth - 144) as string[]
    pdf.text(titleLines, pageWidth / 2, titleTop, { align: 'center', lineHeightFactor: 1.5 })
    pdf.setFont('CourierPrime', 'normal')
    if (project.author) {
      pdf.text('Written by', pageWidth / 2, titleTop + 40 + titleLines.length * 18, { align: 'center' })
      pdf.text(
        pdf.splitTextToSize(project.author, pageWidth - 144) as string[],
        pageWidth / 2,
        titleTop + 70 + titleLines.length * 18,
        {
          align: 'center',
        },
      )
    }
    pdf.text(pdf.splitTextToSize(project.draft, pageWidth - 180) as string[], 108, pageHeight - 84)
    pdf.addPage()
  }
  const layout = paginate(project.blocks, project.paperSize)
  const sceneIds = project.blocks.filter((block) => block.kind === 'scene').map((block) => block.id)
  for (let pageIndex = 0; pageIndex < layout.pageCount; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage()
    pdf.setFont('CourierPrime', 'normal')
    if (pageIndex > 0) pdf.text(`${pageIndex + 1}.`, pageWidth - 72, 42, { align: 'right' })
    for (const part of layout.parts.filter((item) => item.page === pageIndex)) {
      pdf.setFont('CourierPrime', part.kind === 'scene' ? 'bold' : 'normal')
      const left = (page.left + metrics[part.kind].indent * page.charWidth) * 0.75
      part.lines.forEach((line, index) => {
        const top = (page.top + (part.row + index + 0.8) * page.lineHeight) * 0.75
        if (part.kind === 'transition')
          pdf.text(line.text, (page.left + metrics.transition.columns * page.charWidth) * 0.75, top, {
            align: 'right',
          })
        else pdf.text(line.text, left, top)
        if (sceneNumbers && part.kind === 'scene' && index === 0 && line.from === 0) {
          const number = String(sceneIds.indexOf(part.blockId) + 1)
          pdf.text(number, 81, top, { align: 'right' })
          pdf.text(number, pageWidth - 54, top)
        }
      })
    }
  }
  return pdf.output('arraybuffer')
}
