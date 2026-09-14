import { expect, test, type Download, type Page } from './fixtures'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.status-saved')).toBeAttached()
}

async function newScreenplay(page: Page, title = 'The Morning Train') {
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
  await page.getByRole('textbox', { name: 'Written by', exact: true }).fill('A. Writer')
  await page.getByRole('button', { name: 'Create screenplay', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor p')).toHaveCount(1)
}

async function downloadedText(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test('opens a complete, editable, offline-capable writing surface', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await ready(page)
  await expect(page.getByRole('button', { name: 'The Quiet Hours', exact: true })).toBeVisible()
  await expect(page.locator('.scene-row')).toHaveCount(6)
  await expect(page.locator('.paper-sheet')).toHaveCount(3)
  expect(
    await page.evaluate(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    ),
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/studio-desktop.png' })
  await page.context().setOffline(true)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Still listening.')
  await expect(page.locator('.screenplay-editor')).toContainText('Still listening.')
  await expect(page.locator('.status-saved')).toBeVisible()
  expect(errors).toEqual([])
})

test('writes screenplay elements, undoes, saves notes, and survives reload', async ({ page }) => {
  await ready(page)
  await newScreenplay(page)
  await page.locator('.screenplay-editor p').first().click()
  await page.keyboard.type('INT. WORKSHOP - DAY')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A kettle begins to sing.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('ALEX')
  await page.keyboard.press('Enter')
  await page.keyboard.type('We have time.')
  await expect(page.locator('.screenplay-editor p[data-kind="dialogue"]')).toHaveText('We have time.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('We have time.')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toContainText('We have time.')
  await page.locator('#scene-notes').fill('Start with the sound of the kettle.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.screenplay-editor')).toContainText('INT. WORKSHOP - DAY')
  await expect(page.locator('.screenplay-editor')).toContainText('We have time.')
  await expect(page.locator('#scene-notes')).toHaveValue('Start with the sound of the kettle.')
})

test('recovers keystrokes when reloading before the autosave debounce', async ({ page }) => {
  await ready(page)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Immediate recovery.')
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Immediate recovery.')
})

test('exports a native document with stable scene identities and notes', async ({ page }) => {
  await ready(page)
  await page.clock.setFixedTime(new Date('2026-09-14T12:34:56.789Z'))
  const sceneId = await page.locator('.screenplay-editor p').first().getAttribute('data-block-id')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Download copy', exact: true }).click()
  const download = await downloadPromise
  const project = JSON.parse((await downloadedText(download)).toString('utf8'))
  expect(download.suggestedFilename()).toBe('The Quiet Hours_2026-09-14_12-34-56-789Z.scripy')
  expect(project.version).toBe(3)
  expect(project.blocks[0].id).toBe(sceneId)
  expect(project.notes[sceneId!]).toContain('Let the city be a character.')
  await page.clock.setFixedTime(new Date('2026-09-14T12:35:00.001Z'))
  const nextDownload = page.waitForEvent('download')
  await page.keyboard.press('Control+Shift+s')
  const copy = await nextDownload
  expect(copy.suggestedFilename()).toBe('The Quiet Hours_2026-09-14_12-35-00-001Z.scripy')
  expect(JSON.parse((await downloadedText(copy)).toString('utf8'))).toEqual(project)
})

test('imports Fountain as literal text and rejects malformed project files', async ({ page }) => {
  await ready(page)
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'invalid.scripy', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await expect(page.locator('.screenplay-editor')).toContainText('The city holds its breath.')
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'arrival.fountain',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Title: Arrival\n\nINT. STATION - DAY\n\nA train arrives.\n\n!<script>window.scriptInjected=true</script>\n\nLENA\nAt last.\n',
    ),
  })
  await expect(page.locator('.screenplay-editor')).toContainText(
    '<script>window.scriptInjected=true</script>',
  )
  await expect(page.locator('.screenplay-editor p[data-kind="dialogue"]')).toHaveText('At last.')
  expect(await page.evaluate(() => Object.hasOwn(window, 'scriptInjected'))).toBe(false)
})

test('imports a .scripy screenplay from the Document menu', async ({ page }) => {
  await ready(page)
  const now = new Date().toISOString()
  const project = {
    version: 1,
    id: 'imported-from-menu',
    title: 'Imported From Menu',
    author: '',
    draft: 'First draft',
    logline: '',
    createdAt: now,
    updatedAt: now,
    notes: {},
    blocks: [
      { id: 'scene', kind: 'scene', text: 'INT. NEW SCENE - NIGHT' },
      { id: 'action', kind: 'action', text: 'A fresh page begins.' },
    ],
  }
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Import...', exact: true }).click(),
  ])
  await chooser.setFiles({
    name: 'from-menu.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.getByRole('status')).toContainText('Imported from-menu.scripy')
  await expect(page.locator('.screenplay-editor')).toContainText('A fresh page begins.')
  await expect(page.locator('.document-menu-button')).toContainText('Imported From Menu')
})

test('offers a local desktop app download from the Document menu', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  const download = page.getByRole('menuitem', { name: 'Download local app', exact: true })
  await expect(download).toBeVisible()
  await download.click()
  await expect(page.getByRole('status')).toContainText('desktop build link is coming soon')
})

test('finds and replaces literal text with undo support', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('city')
  await expect(page.locator('.search-match').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('town')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.locator('.search-match')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).toContainText('town')
  await page.getByRole('button', { name: 'Close find', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toContainText('The city holds its breath.')
})

test('reorders scenes with their notes, then undoes the move', async ({ page }) => {
  await ready(page)
  const firstId = await page.locator('.screenplay-editor p').first().getAttribute('data-block-id')
  await page.getByRole('tab', { name: 'Outline', exact: true }).click()
  await expect(page.locator('.outline-card')).toHaveCount(6)
  await page.getByRole('button', { name: 'Move scene 1 later', exact: true }).click()
  await expect(page.locator('.outline-card').first()).toContainText("INT. LENA'S APARTMENT")
  await expect(page.locator('.outline-card').nth(1)).toContainText('Let the city be a character.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.outline-card').first()).toContainText('EXT. CITY ROOFTOPS')
  await expect(page.locator('.screenplay-editor p').first()).toHaveAttribute('data-block-id', firstId!)
})

test('restores a snapshot while keeping the superseded draft recoverable', async ({ page }) => {
  await ready(page)
  const sceneId = await page.locator('.screenplay-editor p').first().getAttribute('data-block-id')
  await page.locator('#scene-notes').fill('Original snapshot note.')
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await page.getByRole('button', { name: 'Snapshot', exact: true }).click()
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' An alternate opening.')
  await page.locator('#scene-notes').fill('Alternate opening note.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const snapshot = page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })
  await snapshot.getByRole('button', { name: 'Restore', exact: true }).click()
  await snapshot.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).not.toContainText('An alternate opening.')
  await expect(page.locator('#scene-notes')).toHaveValue('Original snapshot note.')
  await expect(page.locator('.screenplay-editor p').first()).toHaveAttribute('data-block-id', sceneId!)
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('#scene-notes')).toHaveValue('Original snapshot note.')
  await expect(page.locator('.screenplay-editor')).not.toContainText('An alternate opening.')
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const previous = page.locator('.snapshot-row').filter({ hasText: 'Before recovery' })
  await expect(previous).toHaveCount(1)
  await previous.getByRole('button', { name: 'Restore', exact: true }).click()
  await previous.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).toContainText('An alternate opening.')
  await expect(page.locator('#scene-notes')).toHaveValue('Alternate opening note.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('An alternate opening.')
  await expect(page.locator('#scene-notes')).toHaveValue('Alternate opening note.')
})

test('automatic checkpoints retain the draft from the first save after a minute', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T12:00:00.000Z'))
  await ready(page)
  await page.clock.setFixedTime(new Date('2026-09-14T12:01:01.000Z'))
  await page.locator('#scene-notes').fill('Automatic checkpoint note.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.locator('#scene-notes').fill('Later note without a checkpoint.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const snapshot = page.locator('.snapshot-row').filter({ hasText: 'Autosave' })
  await expect(snapshot).toHaveCount(1)
  await snapshot.getByRole('button', { name: 'Restore', exact: true }).click()
  await snapshot.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('#scene-notes')).toHaveValue('Automatic checkpoint note.')
})

test('transfers single-writer ownership with the newest draft', async ({ page, context }) => {
  await ready(page)
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' A handoff marker.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.goto('about:blank')
  await expect(second.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(second.locator('.screenplay-editor')).toContainText('A handoff marker.')
  await second.close()
})

test('fits mobile viewports and provides usable navigation and notes drawers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.locator('.sidebar.mobile-open')).toBeVisible()
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Scene notes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close scene notes', exact: true }).click()
  await expect(page.locator('.sidebar-backdrop')).toHaveCount(0)
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click()
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click()
  await page.screenshot({ path: 'test-results/studio-mobile.png' })
})

test('exports a paginated PDF with a title page, embedded fonts, and selectable text', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const download = await downloadPromise
  const bytes = await downloadedText(download)
  expect(download.suggestedFilename()).toBe('The Quiet Hours.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.includes(Buffer.from('/FontFile2'))).toBe(true)
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const pdf = await loadingTask.promise
  expect(pdf.numPages).toBe(4)
  const text: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber)
    expect(pdfPage.view).toEqual([0, 0, 612, 792])
    const content = await pdfPage.getTextContent()
    for (const item of content.items) {
      if ('str' in item) {
        text.push(item.str)
        if (item.str.trim()) {
          expect(item.transform[4]).toBeGreaterThanOrEqual(40)
          expect(item.transform[5]).toBeGreaterThan(20)
          expect(item.transform[5]).toBeLessThan(780)
        }
      }
    }
  }
  expect(text.join(' ')).toContain('THE QUIET HOURS')
  expect(text.join(' ')).toContain('The city holds its breath.')
  expect(text.join(' ')).toContain('(MORE)')
  expect(text.join(' ')).toContain("(CONT'D)")
  expect(text.join(' ')).toContain('FADE OUT.')
  await loadingTask.destroy()
})

test('keeps feature-length typing responsive', async ({ page }) => {
  await ready(page)
  const blocks = Array.from({ length: 1200 }, (_, index) => ({
    id: `block-${index}`,
    kind: index % 6 === 0 ? 'scene' : 'action',
    text:
      index % 6 === 0
        ? `INT. STATION ${index} - DAY`
        : 'The station is quiet. A distant announcement echoes through the empty hall.',
  }))
  const now = new Date().toISOString()
  const project = {
    version: 1,
    id: 'feature-length-fixture',
    title: 'A Long Journey',
    author: '',
    draft: 'First draft',
    logline: '',
    createdAt: now,
    updatedAt: now,
    notes: {},
    blocks,
  }
  await page.locator('input[type="file"]').setInputFiles({
    name: 'feature.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.locator('.screenplay-editor p')).toHaveCount(1200)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  const started = Date.now()
  await page.keyboard.type(' Still listening.')
  await expect(page.locator('.screenplay-editor p').nth(1)).toContainText('Still listening.')
  const elapsed = Date.now() - started
  expect(elapsed).toBeLessThan(2500)
  console.log(
    `Feature-length typing: ${elapsed} ms for 17 keystrokes across ${await page.locator('.paper-sheet').count()} pages.`,
  )
})

test('normalizes unrecognized element types in pasted HTML', async ({ page }) => {
  await ready(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.locator('.screenplay-editor').evaluate((element) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/html', '<p data-kind="unsupported">Safe pasted text.</p>')
    clipboard.setData('text/plain', 'Safe pasted text.')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.locator('.screenplay-editor')).toContainText('Safe pasted text.')
  await expect(page.locator('.status-saved')).toBeVisible()
  expect(errors).toEqual([])
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Safe pasted text.')
})

test('restores scene notes when a deleted screenplay is undone', async ({ page }) => {
  await ready(page)
  const note = await page.locator('#scene-notes').inputValue()
  await page.locator('.screenplay-editor p').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.screenplay-editor p')).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor p')).toHaveCount(58)
  await page.locator('.scene-row').first().click()
  await expect(page.locator('#scene-notes')).toHaveValue(note)
})
