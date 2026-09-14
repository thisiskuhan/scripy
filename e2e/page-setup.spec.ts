import { expect, test, type Page } from './fixtures'
import { getDocument, OPS, Util, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import path from 'node:path'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function exportPdf(page: Page, includeTitle = true) {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Include title page', exact: true }).setChecked(includeTitle)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true })
  return { loading, pdf: await loading.promise }
}

async function imageDetails(pdfPage: PDFPageProxy) {
  const operators = await pdfPage.getOperatorList()
  const images: number[][] = []
  const stack: number[][] = []
  let matrix = [1, 0, 0, 1, 0, 0]
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operation = operators.fnArray[index]
    if (operation === OPS.save) stack.push([...matrix])
    else if (operation === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (operation === OPS.transform) matrix = Util.transform(matrix, operators.argsArray[index])
    else if (
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(operation)
    )
      images.push([...matrix])
  }
  return images
}

test('A4 selection persists and exported pages use ISO A4 dimensions', async ({ page }) => {
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' An undoable line.')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('a4')
  await expect(page.locator('.paper-stack')).toHaveAttribute('data-paper-size', 'a4')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('An undoable line.')
  await expect(page.locator('.paper-stack')).toHaveAttribute('data-paper-size', 'a4')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.paper-stack')).toHaveAttribute('data-paper-size', 'a4')
  const { loading, pdf } = await exportPdf(page)
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const pdfPage = await pdf.getPage(index)
    expect(pdfPage.view[2]).toBeCloseTo(595.28, 1)
    expect(pdfPage.view[3]).toBeCloseTo(841.89, 1)
    expect(await imageDetails(pdfPage)).toHaveLength(0)
  }
  await loading.destroy()
})

for (const paperSize of ['letter', 'a4']) {
  test(`${paperSize} editor paragraph positions match the shared pagination model`, async ({ page }) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption(paperSize)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    const deviations = await page.evaluate(async (size) => {
      const modulePath = '/src/lib/layout.ts'
      const { paginate, partTop } = await import(modulePath)
      const nodes = [...document.querySelectorAll<HTMLParagraphElement>('.screenplay-editor p')]
      const blocks = nodes.map((node) => {
        const copy = node.cloneNode(true) as HTMLElement
        copy.querySelectorAll('.page-spacer').forEach((spacer) => spacer.remove())
        return { id: node.dataset.blockId, kind: node.dataset.kind, text: copy.textContent }
      })
      const layout = paginate(blocks, size)
      const bounds = document.querySelector('.paper-stack')!.getBoundingClientRect()
      const width = size === 'a4' ? (210 / 25.4) * 96 : 816
      const scale = bounds.width / width
      return nodes
        .map((node) => {
          const parts = layout.parts.filter(
            (item: { blockId: string; marker?: string }) =>
              item.blockId === node.dataset.blockId && !item.marker,
          )
          const part = parts[0]
          const last = parts[parts.length - 1]
          const actual = (node.getBoundingClientRect().top - bounds.top) / scale
          const expected = partTop(part, size)
          const height = node.getBoundingClientRect().height / scale
          const expectedHeight = partTop(last, size) + last.lines.length * 16 - expected
          return {
            text: node.textContent?.slice(0, 70),
            actual,
            expected,
            height,
            expectedHeight,
            width: getComputedStyle(node).width,
            html: Math.abs(height - expectedHeight) > 1 ? node.outerHTML : undefined,
            font:
              Math.abs(height - expectedHeight) > 1
                ? {
                    family: getComputedStyle(node).fontFamily,
                    size: getComputedStyle(node).fontSize,
                    spacing: getComputedStyle(node).letterSpacing,
                    wordSpacing: getComputedStyle(node).wordSpacing,
                    textWrap: getComputedStyle(node).textWrap,
                    lines: (() => {
                      const range = document.createRange()
                      range.selectNodeContents(node)
                      return [...range.getClientRects()].map((rect) => ({
                        width: rect.width / scale,
                        height: rect.height / scale,
                      }))
                    })(),
                  }
                : undefined,
          }
        })
        .filter(
          (item) =>
            Math.abs(item.actual - item.expected) > 1 || Math.abs(item.height - item.expectedHeight) > 1,
        )
    }, paperSize)
    expect(deviations).toEqual([])
  })
}

test('title artwork is embedded above the title and never appears on screenplay pages', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('a4')
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  const image = await page.getByRole('img', { name: 'Title-page artwork', exact: true }).boundingBox()
  const title = await page.locator('.title-preview-copy strong').boundingBox()
  expect(image!.y + image!.height).toBeLessThan(title!.y)
  await page.getByRole('dialog').screenshot({ path: 'test-results/title-page-artwork.png' })
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(page.locator('.screenplay-editor img')).toHaveCount(0)
  await expect(page.locator('.status-saved')).toBeVisible()
  const { loading, pdf } = await exportPdf(page)
  const first = await pdf.getPage(1)
  const images = await imageDetails(first)
  expect(images).toHaveLength(1)
  const text = await first.getTextContent()
  const heading = text.items.find((item) => 'str' in item && item.str === 'THE QUIET HOURS')
  expect(heading && 'transform' in heading).toBeTruthy()
  if (heading && 'transform' in heading) expect(images[0][5]).toBeGreaterThan(heading.transform[5] + 20)
  for (let index = 2; index <= pdf.numPages; index += 1)
    expect(await imageDetails(await pdf.getPage(index))).toHaveLength(0)
  await loading.destroy()

  const withoutTitle = await exportPdf(page, false)
  for (let index = 1; index <= withoutTitle.pdf.numPages; index += 1)
    expect(await imageDetails(await withoutTitle.pdf.getPage(index))).toHaveLength(0)
  await withoutTitle.loading.destroy()

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Download copy', exact: true }).click()
  const download = await pending
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const buffer = Buffer.concat(chunks)
  const saved = JSON.parse(buffer.toString('utf8'))
  expect(saved.version).toBe(3)
  expect(saved.paperSize).toBe('a4')
  expect(saved.titleArtwork.dataUrl).toMatch(/^data:image\/png;base64,/)
  expect(saved.titleArtwork.width / saved.titleArtwork.height).toBe(16 / 9)
  expect(Buffer.from(saved.titleArtwork.dataUrl.split(',')[1], 'base64').length).toBeLessThan(3000000)
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('button', { name: 'Remove title image', exact: true }).click()
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page
    .getByLabel('Open screenplay file', { exact: true })
    .setInputFiles({ name: 'with-artwork.scripy', mimeType: 'application/json', buffer })
  await expect(page.getByRole('status')).toContainText('Imported with-artwork.scripy')
  await page.reload()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Paper size', exact: true })).toHaveValue('a4')
})

test('image replacement and removal are optional and cancel does not change the document', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('e2e/fixtures/title-4k.jpg'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('button', { name: 'Remove title image', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
  await expect(page.locator('.artwork-filename')).toHaveText('title-1080p.png')
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('button', { name: 'Remove title image', exact: true }).click()
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  const { loading, pdf } = await exportPdf(page)
  expect(await imageDetails(await pdf.getPage(1))).toHaveLength(0)
  await loading.destroy()
})

test('rejects unsupported and oversized artwork without replacing the existing image', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  const input = page.getByLabel('Title-page image file', { exact: true })
  await expect(page.locator('.artwork-requirements')).toContainText('1920 x 1080 or 3840 x 2160, under 3 MB')
  await input.setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  const original = await page
    .getByRole('img', { name: 'Title-page artwork', exact: true })
    .getAttribute('src')
  await input.setInputFiles(path.resolve('public/icon.png'))
  await expect(page.getByRole('alert')).toContainText('Choose a 16:9 image')
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toHaveAttribute(
    'src',
    original!,
  )
  await input.setInputFiles({
    name: 'not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
  })
  await expect(page.getByRole('alert')).toContainText('Only PNG, JPG, and JPEG')
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toHaveAttribute(
    'src',
    original!,
  )
  await input.setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(3000000),
  })
  await expect(page.getByRole('alert')).toContainText('smaller than 3 MB')
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toHaveAttribute(
    'src',
    original!,
  )
})

test('title-page controls and preview fit a mobile dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Document details', exact: true }).click()
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  expect(
    await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.getByRole('dialog').screenshot({ path: 'test-results/title-page-mobile.png' })
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
})
