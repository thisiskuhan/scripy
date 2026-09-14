import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-desktop-'))
const screenplayPath = path.join(temporary, 'The Quiet Hours.scripy')
const pdfPath = path.join(temporary, 'The Quiet Hours.pdf')
let application
const errors = []
try {
  const args = process.env.SCRIPY_TEST_EXECUTABLE ? [] : [path.join(root, 'scripts/desktop-fixture.cjs')]
  if (process.env.SCRIPY_TEST_NO_SANDBOX === '1') args.push('--no-sandbox')
  application = await electron.launch({
    executablePath: process.env.SCRIPY_TEST_EXECUTABLE,
    args,
    env: { ...process.env, SCRIPY_TEST_DATA: temporary, ELECTRON_RUN_AS_NODE: undefined },
    timeout: 25000,
  })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(home).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByRole('main', { name: 'Sign in to Scripy' })).toHaveCount(0)
  await expect(page.locator('script[src*="accounts.google.com"]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  if (process.env.SCRIPY_TEST_OFFLINE === '1') {
    assert.equal(new URL(page.url()).protocol, 'scripy:')
    assert.equal(await application.evaluate(({ app }) => app.isPackaged), true)
    const externalRequests = []
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url())
    })
    page.on('close', () => {
      errors.push(...externalRequests.map((url) => `Unexpected external request: ${url}`))
    })
    await page.context().setOffline(true)
  }
  await home.getByRole('button', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(home.getByText('No screenplays yet.', { exact: true })).toBeVisible()
  await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name: 'The Quiet Hours.scripy',
    mimeType: 'application/json',
    buffer: await fs.readFile(path.join(root, 'e2e/fixtures/native-screenplay.json')),
  })
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  const permissions = await page.evaluate(() => ({
    node: typeof require,
    process: typeof process,
    bridge: typeof window.scripyDesktop?.saveDocument,
  }))
  assert.deepEqual(permissions, { node: 'undefined', process: 'undefined', bridge: 'function' })
  const initialText = await page.locator('.screenplay-editor').innerText()
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect
    .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
    .toBe(true)
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeEnabled()
  assert.equal(await page.locator('.screenplay-editor').innerText(), initialText)
  await page.screenshot({ path: path.join(root, 'test-results/studio-native-fullscreen.png') })
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await expect
    .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
    .toBe(false)
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
  await page.keyboard.press('F11')
  await expect
    .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
    .toBe(true)
  await page.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.equal(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
    true,
  )
  await page.keyboard.press('Escape')
  await expect
    .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
    .toBe(false)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true))
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  await page.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  assert.equal(await page.locator('.scene-row').count(), 6)
  assert.equal(
    await page.evaluate(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    ),
    true,
  )
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('a4')
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.join(root, 'e2e', 'fixtures', 'title-1080p.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.evaluate(() => {
    const editor = document.querySelector('.screenplay-editor')
    const paragraph = [...editor.querySelectorAll('p')].find((node) => node.textContent.includes('sleeping'))
    const offset = paragraph.textContent.indexOf('sleeping')
    editor.focus()
    const range = document.createRange()
    range.setStart(paragraph.firstChild, offset)
    range.setEnd(paragraph.firstChild, offset + 'sleeping'.length)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const noteDialog = page.getByRole('dialog', { name: 'New passage note' })
  await noteDialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Preserve the quiet atmosphere.')
  for (const department of ['Sound', 'Music', 'Cinematography'])
    await noteDialog.getByRole('checkbox', { name: department, exact: true }).check()
  for (const tag of ['general', 'camera'])
    await noteDialog.getByRole('checkbox', { name: tag, exact: true }).check()
  await noteDialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.scripyTestSuggestedFilename = options.defaultPath
      return { canceled: false, filePath: destination }
    }
  }, screenplayPath)
  await expect(page.getByRole('button', { name: 'Save document', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as...', exact: true }).click()
  await page.getByText('Screenplay saved to disk.', { exact: true }).waitFor()
  assert.match(
    await application.evaluate(() => globalThis.scripyTestSuggestedFilename),
    /The Quiet Hours_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z\.scripy$/,
  )
  await expect(page.locator('.file-location')).toHaveText(screenplayPath)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Home keeps undo.')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await home.getByRole('button', { name: 'Open The Quiet Hours', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('Home keeps undo.')
  await expect(page.locator('.status-saved')).toBeVisible()
  assert.equal(await page.evaluate(() => window.scripyDesktop.getLocation('missing-document')), null)
  assert.equal(JSON.parse(await fs.readFile(screenplayPath, 'utf8')).title, 'The Quiet Hours')
  const savedDocument = JSON.parse(await fs.readFile(screenplayPath, 'utf8'))
  assert.equal(savedDocument.version, 3)
  assert.equal(savedDocument.paperSize, 'a4')
  assert.equal(savedDocument.annotations.length, 1)
  assert.equal(savedDocument.annotations[0].quote, 'sleeping')
  assert.deepEqual(savedDocument.annotations[0].departments, ['Sound', 'Music', 'Cinematography'])
  assert.deepEqual(savedDocument.annotations[0].tags, ['general', 'camera'])
  assert.match(savedDocument.titleArtwork.dataUrl, /^data:image\/png;base64,/)
  await application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
  }, pdfPath)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await page.getByText('PDF exported.', { exact: true }).waitFor()
  assert.equal((await fs.readFile(pdfPath)).subarray(0, 5).toString(), '%PDF-')
  const loading = getDocument({ data: new Uint8Array(await fs.readFile(pdfPath)), useSystemFonts: true })
  const pdf = await loading.promise
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const pdfPage = await pdf.getPage(index)
    assert.ok(Math.abs(pdfPage.view[2] - 595.28) < 0.02)
    assert.ok(Math.abs(pdfPage.view[3] - 841.89) < 0.02)
    const operations = await pdfPage.getOperatorList()
    assert.equal(
      operations.fnArray.filter((operation) => operation === OPS.paintImageXObject).length,
      index === 1 ? 1 : 0,
    )
  }
  await loading.destroy()
  await page.screenshot({ path: path.join(root, 'test-results/studio-desktop-native.png') })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' The final keystrokes are safe.')
  await application.close()
  application = undefined
  assert.match(await fs.readFile(screenplayPath, 'utf8'), /The final keystrokes are safe\./)
  assert.equal((await fs.stat(`${screenplayPath}.bak`)).isFile(), true)
  assert.deepEqual(errors, [])
  application = await electron.launch({
    executablePath: process.env.SCRIPY_TEST_EXECUTABLE,
    args,
    env: { ...process.env, SCRIPY_TEST_DATA: temporary, ELECTRON_RUN_AS_NODE: undefined },
    timeout: 25000,
  })
  const reopened = await application.firstWindow()
  await expect(reopened.getByRole('main', { name: 'Scripy home', exact: true })).toBeVisible()
  await reopened.getByRole('button', { name: 'Open The Quiet Hours', exact: true }).click()
  await expect(reopened.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark')
  assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark')
  await expect(reopened.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(reopened.locator('.file-location')).toHaveText(screenplayPath)
  await expect(reopened.locator('.screenplay-editor')).toContainText('The final keystrokes are safe.')
  await expect(reopened.locator('.paper-stack')).toHaveAttribute('data-paper-size', 'a4')
  await expect(reopened.locator('.passage-highlight')).toHaveText('sleeping')
  await reopened.getByRole('tab', { name: 'Notes', exact: true }).click()
  const notesView = reopened.getByRole('region', { name: 'Screenplay notes', exact: true })
  await expect(notesView.locator('.passage-note-row')).toContainText('Preserve the quiet atmosphere.')
  await notesView.locator('summary', { hasText: 'Departments' }).click()
  await notesView.getByRole('checkbox', { name: 'Sound', exact: true }).check()
  await notesView.locator('summary', { hasText: 'Departments' }).click()
  await expect(notesView.locator('.passage-note-row')).toHaveCount(1)
  await reopened.getByRole('tab', { name: 'Script', exact: true }).click()
  await reopened.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(reopened.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click()
  await application.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw new Error('Saving a reopened file must not ask for a location.')
    }
  })
  await reopened.keyboard.press('ControlOrMeta+s')
  await reopened.getByText('Changes saved.', { exact: true }).waitFor()
  await reopened.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
  await reopened.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  await reopened.getByRole('radio', { name: 'System', exact: true }).check()
  await expect.poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
  await reopened.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await application.close()
  application = undefined
  console.log(
    'Desktop smoke passed: offline home and recents, passage notes and filters, native fullscreen and F11/Escape, external fullscreen changes, theme persistence, A4 artwork export, save/restart, backup, and close-time flush.',
  )
} catch (error) {
  console.error('Desktop renderer errors:', errors)
  throw error
} finally {
  if (application) await application.close().catch(() => undefined)
  await fs.rm(temporary, { recursive: true, force: true })
}
