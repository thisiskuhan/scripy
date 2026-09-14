import { expect, test, type Download, type Page } from './fixtures'
import path from 'node:path'

const viewports = [
  { name: 'small-phone', width: 320, height: 568, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'small-tablet', width: 600, height: 960, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true },
  { name: 'large-tablet', width: 1180, height: 820, touch: true },
  { name: 'laptop', width: 1366, height: 768, touch: false },
  { name: 'desktop', width: 1920, height: 1080, touch: false },
]

async function downloadBytes(download: Download) {
  expect(await download.failure()).toBeNull()
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function chromeFits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const issues: string[] = []
        for (const selector of ['.app-header', '.view-bar', '.editor-toolbar']) {
          const bar = document.querySelector<HTMLElement>(selector)!
          if (!bar.getBoundingClientRect().height) continue
          for (const control of bar.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled)',
          )) {
            const bounds = control.getBoundingClientRect()
            if (!bounds.width || !bounds.height || getComputedStyle(control).visibility === 'hidden') continue
            const name = control.getAttribute('aria-label') || control.title || control.textContent?.trim()
            if (
              bounds.left < -1 ||
              bounds.right > innerWidth + 1 ||
              bounds.top < 0 ||
              bounds.bottom > innerHeight
            )
              issues.push(`${name} is outside the viewport`)
            const hit = document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            )
            if (!hit || !control.contains(hit)) issues.push(`${name} is obstructed`)
          }
        }
        if (document.documentElement.scrollWidth > innerWidth) issues.push('Page overflows horizontally')
        return issues
      }),
    )
    .toEqual([])
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch })

    test('complete writing, notes, file, and PDF workflow fits the viewport', async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
      await page.evaluate(() => document.fonts.ready)
      await chromeFits(page)
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
      await page.getByRole('button', { name: 'Document menu', exact: true }).click()
      await page.getByRole('menuitem', { name: 'New screenplay', exact: true }).click()
      const title = 'The Long Journey Through a City That Never Sleeps'
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
      await page.getByRole('textbox', { name: 'Written by', exact: true }).fill('Kuhan')
      await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('a4')
      await page
        .getByLabel('Title-page image file', { exact: true })
        .setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
      await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create screenplay', exact: true })).toBeInViewport({
        ratio: 1,
      })
      expect(
        await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true)
      await page.getByRole('button', { name: 'Create screenplay', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await chromeFits(page)
      const paragraph = page.locator('.screenplay-editor p').first()
      if (viewport.touch) await paragraph.tap()
      else await paragraph.click()
      await page.keyboard.type('INT. STATION - DAWN')
      await page.keyboard.press('Enter')
      await page.keyboard.type('The platform is sleeping.')
      await page.keyboard.press('ArrowLeft')
      for (let index = 0; index < 'sleeping'.length; index += 1) await page.keyboard.press('Shift+ArrowLeft')
      await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: 'Add note', exact: true }).click()
      const noteDialog = page.getByRole('dialog', { name: 'New passage note' })
      await expect(noteDialog.locator('.note-quote-preview')).toHaveText('sleeping')
      await noteDialog
        .getByRole('textbox', { name: 'Note text', exact: true })
        .fill('Keep the station quiet until the train arrives.')
      await noteDialog.getByRole('checkbox', { name: 'Sound', exact: true }).check()
      await noteDialog.getByRole('checkbox', { name: 'Music', exact: true }).check()
      await noteDialog.getByRole('checkbox', { name: 'general', exact: true }).check()
      await noteDialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('train arrival')
      await expect(noteDialog.getByRole('button', { name: 'Save note', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await noteDialog.getByRole('button', { name: 'Save note', exact: true }).click()
      await page.getByRole('tab', { name: 'Notes', exact: true }).click()
      const notes = page.getByRole('region', { name: 'Screenplay notes', exact: true })
      await notes.locator('summary', { hasText: 'Departments' }).click()
      await notes.getByRole('checkbox', { name: 'Sound', exact: true }).check()
      await notes.locator('summary', { hasText: 'Departments' }).click()
      await notes.locator('summary', { hasText: 'Tags' }).click()
      await notes.getByRole('checkbox', { name: 'train arrival', exact: true }).check()
      const menu = notes.locator('.note-filter[open] .note-filter-options')
      await expect(menu).toBeInViewport({ ratio: 1 })
      await notes.locator('summary', { hasText: 'Tags' }).click()
      await notes.getByRole('textbox', { name: 'Search notes', exact: true }).fill('sleeping')
      await expect(notes.locator('.passage-note-row')).toHaveCount(1)
      expect(await notes.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.screenshot({
        path: `test-results/responsive-${testInfo.project.name || 'chromium'}-${viewport.name}-notes.png`,
      })
      await notes.getByRole('button', { name: 'Go to passage', exact: true }).click()
      await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
      const showNotes = page.getByRole('button', { name: 'Show scene notes', exact: true })
      if (await showNotes.isVisible()) await showNotes.click()
      await page.locator('#scene-notes').fill('Leave space for the first train.')
      const closeNotes = page.getByRole('button', { name: 'Close scene notes', exact: true })
      if (await closeNotes.isVisible()) await closeNotes.click()
      else await page.getByRole('button', { name: 'Hide scene notes', exact: true }).click()
      const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true })
      if (await openNavigation.isVisible()) await openNavigation.click()
      await page.getByRole('textbox', { name: 'Filter scenes', exact: true }).fill('station')
      await expect(page.locator('.scene-row')).toHaveCount(1)
      await page.locator('.scene-row').click()
      await chromeFits(page)
      await page.keyboard.press('Control+s')
      await expect(page.getByRole('status')).toHaveText('Changes saved.')
      await page.getByRole('button', { name: 'Document menu', exact: true }).click()
      const pendingFile = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Download copy', exact: true }).click()
      const file = await pendingFile
      const bytes = await downloadBytes(file)
      const project = JSON.parse(bytes.toString('utf8'))
      expect(project.title).toBe(title)
      expect(project.paperSize).toBe('a4')
      expect(project.annotations[0].quote).toBe('sleeping')
      expect(project.annotations[0].tags).toContain('train arrival')
      expect(project.notes[project.blocks[0].id]).toBe('Leave space for the first train.')
      await page.reload()
      await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
      await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: file.suggestedFilename(), mimeType: 'application/json', buffer: bytes })
      await expect(page.getByRole('status')).toHaveText(`Imported ${file.suggestedFilename()}`)
      await page.getByRole('button', { name: 'Export', exact: true }).click()
      const exportDialog = page.getByRole('dialog', { name: 'Export screenplay' })
      await expect(exportDialog.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled()
      expect(await exportDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      const pendingPdf = page.waitForEvent('download')
      await exportDialog.getByRole('button', { name: 'Export PDF', exact: true }).click()
      expect((await downloadBytes(await pendingPdf)).subarray(0, 5).toString()).toBe('%PDF-')
      await expect(page.getByRole('status')).toHaveText('PDF exported.')
      await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click()
      await page.getByRole('tab', { name: 'Outline', exact: true }).click()
      await expect(page.locator('.outline-card')).toHaveCount(1)
      await page.getByRole('tab', { name: 'Script', exact: true }).click()
      await chromeFits(page)
      await page.screenshot({
        path: `test-results/responsive-${testInfo.project.name || 'chromium'}-${viewport.name}-script.png`,
      })
      expect(errors).toEqual([])
    })
  })
}

test('open dialogs and drawer controls adapt to rotation and a reduced viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Document details', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Rotating draft')
  for (const size of [
    { width: 390, height: 360 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size)
    await expect(page.getByRole('button', { name: 'Save details', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport({ ratio: 1 })
    expect(
      await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Rotating draft')
  }
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  for (const size of [
    { width: 320, height: 568 },
    { width: 600, height: 960 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size)
    await chromeFits(page)
    const show = page.getByRole('button', { name: 'Show scene notes', exact: true })
    if (await show.isVisible()) await show.click()
    await expect(page.getByRole('complementary', { name: 'Scene notes', exact: true })).toBeVisible()
    const closeNotes = page.getByRole('button', { name: 'Close scene notes', exact: true })
    if (await closeNotes.isVisible()) await closeNotes.click()
    else await page.getByRole('button', { name: 'Hide scene notes', exact: true }).click()
    await chromeFits(page)
  }
})
