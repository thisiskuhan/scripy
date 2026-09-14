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
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true', {
    timeout: 20000,
  })
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
    .setInputFiles(path.join(root, 'public', 'icon.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.scripyTestSuggestedFilename = options.defaultPath
      return { canceled: false, filePath: destination }
    }
  }, screenplayPath)
  await page.getByRole('button', { name: 'Save document', exact: true }).click()
  await page.getByText('Screenplay saved to disk.', { exact: true }).waitFor()
  assert.match(
    await application.evaluate(() => globalThis.scripyTestSuggestedFilename),
    /The Quiet Hours_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z\.scripy$/,
  )
  await expect(page.locator('.file-location')).toHaveText(screenplayPath)
  assert.equal(await page.evaluate(() => window.scripyDesktop.getLocation('missing-document')), null)
  assert.equal(JSON.parse(await fs.readFile(screenplayPath, 'utf8')).title, 'The Quiet Hours')
  const savedDocument = JSON.parse(await fs.readFile(screenplayPath, 'utf8'))
  assert.equal(savedDocument.version, 2)
  assert.equal(savedDocument.paperSize, 'a4')
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
  await expect(reopened.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark')
  assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark')
  await expect(reopened.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(reopened.locator('.file-location')).toHaveText(screenplayPath)
  await expect(reopened.locator('.screenplay-editor')).toContainText('The final keystrokes are safe.')
  await expect(reopened.locator('.paper-stack')).toHaveAttribute('data-paper-size', 'a4')
  await reopened.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(reopened.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click()
  await application.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw new Error('Saving a reopened file must not ask for a location.')
    }
  })
  await reopened.getByRole('button', { name: 'Save document', exact: true }).click()
  await reopened.getByText('Screenplay saved to disk.', { exact: true }).waitFor()
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
    'Desktop smoke passed: native fullscreen and F11/Escape, external fullscreen changes, theme persistence, A4 artwork export, save/restart, backup, and close-time flush.',
  )
} catch (error) {
  console.error('Desktop renderer errors:', errors)
  throw error
} finally {
  if (application) await application.close().catch(() => undefined)
  await fs.rm(temporary, { recursive: true, force: true })
}
