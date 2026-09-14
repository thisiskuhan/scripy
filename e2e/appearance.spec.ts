import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import path from 'node:path'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
}

async function chooseTheme(page: Page, theme: 'Light' | 'Dark' | 'System') {
  if ((await page.getByRole('dialog', { name: 'Editor preferences', exact: true }).count()) === 0) {
    await page.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  }
  await page.getByRole('radio', { name: theme, exact: true }).check()
}

function luminance(color: string) {
  const channels = color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map((value) => {
      const channel = Number(value) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

test('dark mode persists and preserves screenplay content, selection, and undo', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await ready(page)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' An undoable dark-mode edit.')
  const before = await page.locator('.screenplay-editor').innerText()
  const ids = await page
    .locator('.screenplay-editor p')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')))
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  expect(await page.locator('.screenplay-editor').innerText()).toBe(before)
  expect(
    await page
      .locator('.screenplay-editor p')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id'))),
  ).toEqual(ids)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('An undoable dark-mode edit.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await chooseTheme(page, 'Light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.paper-sheet').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})

test('System follows OS changes and an explicit choice overrides the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await chooseTheme(page, 'Dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await chooseTheme(page, 'System')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('saved appearance is applied before the application module loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('scripy.appearance', 'dark'))
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/src/main.tsx', async (route) => {
    await gate
    await route.continue()
  })
  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.locator('.app').count()).toBe(0)
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(24, 28, 26)')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  } finally {
    release()
  }
  await expect(page.locator('.screenplay-editor')).toBeVisible()
})

test('dark surfaces and text have readable contrast across the workspace and dialogs', async ({ page }) => {
  await ready(page)
  await chooseTheme(page, 'Dark')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  const selectors = [
    '.app-header',
    '.sidebar',
    '.inspector',
    '.editor-toolbar',
    '.document-canvas',
    '.paper-sheet',
    '.status-bar',
  ]
  for (const selector of selectors) {
    const background = await page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(luminance(background), selector).toBeLessThan(0.1)
  }
  for (const [textSelector, surfaceSelector, minimum] of [
    ['.screenplay-editor', '.paper-sheet', 7],
    ['.scene-location', '.sidebar', 4.5],
    ['.scene-time', '.sidebar', 4.5],
    ['.notes-area textarea', '.notes-area textarea', 4.5],
    ['.export-button', '.export-button', 4.5],
    ['.paper-size', '.editor-toolbar', 4.5],
  ] as const) {
    const foreground = await page
      .locator(textSelector)
      .first()
      .evaluate((element) => getComputedStyle(element).color)
    const background = await page
      .locator(surfaceSelector)
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(contrast(foreground, background), textSelector).toBeGreaterThanOrEqual(minimum)
  }
  await page.screenshot({ path: 'test-results/studio-dark-desktop.png' })
  await page.getByRole('tab', { name: 'Outline', exact: true }).click()
  await expect(page.locator('.outline-card')).toHaveCount(6)
  await page.screenshot({ path: 'test-results/studio-dark-outline.png' })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  expect(
    luminance(
      await page.getByRole('dialog').evaluate((element) => getComputedStyle(element).backgroundColor),
    ),
  ).toBeLessThan(0.1)
  await page.getByRole('dialog').screenshot({ path: 'test-results/studio-dark-export.png' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  for (const field of await page
    .getByRole('dialog')
    .locator('input:not([type=file]), textarea, select')
    .all()) {
    const style = await field.evaluate((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }))
    expect(luminance(style.background)).toBeLessThan(0.1)
    expect(contrast(style.text, style.background)).toBeGreaterThanOrEqual(4.5)
  }
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('public/icon.png'))
  const image = page.getByRole('img', { name: 'Title-page artwork', exact: true })
  await expect(image).toBeVisible()
  await expect(image).toHaveCSS('filter', 'none')
  const imageSource = await image.getAttribute('src')
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByRole('tab', { name: 'Script', exact: true }).click()
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('city')
  const highlight = await page
    .locator('.search-match')
    .first()
    .evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }))
  expect(contrast(highlight.foreground, highlight.background)).toBeGreaterThanOrEqual(4.5)
  await page.getByRole('button', { name: 'Close find', exact: true }).click()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await expect(page.locator('.snapshot-row').first()).toBeVisible()
  expect(
    luminance(
      await page.getByRole('dialog').evaluate((element) => getComputedStyle(element).backgroundColor),
    ),
  ).toBeLessThan(0.1)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toHaveAttribute(
    'src',
    imageSource!,
  )
})

test('appearance changes synchronize across tabs without altering the draft', async ({ page, context }) => {
  await ready(page)
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  await chooseTheme(page, 'Dark')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark')
  await chooseTheme(page, 'Light')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(other.locator('.screenplay-editor')).toContainText('The city holds its breath.')
  await other.close()
})

test('dark mode leaves exported PDFs and image colors independent of the UI', async ({ page }) => {
  await ready(page)
  await chooseTheme(page, 'Dark')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true })
  const pdf = await loading.promise
  expect(pdf.numPages).toBe(4)
  const firstScriptPage = await pdf.getPage(2)
  const text = await firstScriptPage.getTextContent()
  expect(text.items.some((item) => 'str' in item && item.str === 'The city holds its breath.')).toBe(true)
  expect(firstScriptPage.view).toEqual([0, 0, 612, 792])
  await loading.destroy()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.screenplay-editor')).toHaveCSS('color', 'rgb(37, 42, 37)')
})

test('dark appearance controls and mobile drawers fit narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await chooseTheme(page, 'Dark')
  await page.getByRole('dialog').screenshot({ path: 'test-results/studio-dark-preferences-mobile.png' })
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Scene notes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close scene notes', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/studio-dark-mobile.png' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const tabs = await page.locator('.view-tabs').boundingBox()
  const actions = await page.locator('.view-actions').boundingBox()
  expect(tabs!.x + tabs!.width).toBeLessThanOrEqual(actions!.x)
  await page.screenshot({ path: 'test-results/studio-dark-mobile-320.png' })
})

test('unavailable preference storage does not block changing appearance or writing', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'scripy.appearance') throw new DOMException('Storage unavailable', 'QuotaExceededError')
      return save.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('status')).toContainText('preference could not be saved')
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Still writable.')
  await expect(page.locator('.screenplay-editor')).toContainText('Still writable.')
  await expect(page.locator('.status-saved')).toBeVisible()
})
