import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('brand is text only with the requested hover and focus tooltip; Export has no chevron', async ({
  page,
}) => {
  const brand = page.locator('.app-header .wordmark')
  await expect(page.locator('.app-header .brand svg')).toHaveCount(0)
  await expect(brand).toContainText('scripy.')
  await expect(page.getByRole('tooltip', { name: 'made by Kuhan' })).toHaveCount(0)
  await brand.hover()
  await expect(page.getByRole('tooltip', { name: 'made by Kuhan' })).toBeVisible()
  await page.getByRole('tab', { name: 'Script', exact: true }).hover()
  await brand.focus()
  await expect(page.getByRole('tooltip', { name: 'made by Kuhan' })).toBeVisible()
  await expect(page.locator('.export-button svg')).toHaveCount(1)
  await expect(page.locator('.export-button .lucide-chevron-down')).toHaveCount(0)
})

test('export failure floats above the dialog, leaves layout unchanged, and retry shows success', async ({
  page,
}) => {
  const editorBefore = await page.locator('.editor-toolbar').boundingBox()
  await page.context().route('**/src/lib/pdf.worker.ts*', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialogBefore = await page.getByRole('dialog').boundingBox()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const error = page.getByRole('alert')
  await expect(error).toContainText('PDF exporter could not be loaded')
  await expect(error).toBeVisible()
  expect(await page.locator('.editor-toolbar').boundingBox()).toEqual(editorBefore)
  expect(await page.getByRole('dialog').boundingBox()).toEqual(dialogBefore)
  expect(
    await error.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const hit = document.elementFromPoint(bounds.left + 12, bounds.top + 12)
      return hit !== null && element.contains(hit)
    }),
  ).toBe(true)
  await expect(page.locator('.error-banner, .form-error')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/export-floating-error.png' })
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  await expect(error).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.context().unroute('**/src/lib/pdf.worker.ts*')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('The Quiet Hours.pdf')
  await expect(page.getByRole('status')).toHaveText('PDF exported.')
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.locator('.floating-notifications')).toHaveCSS('position', 'fixed')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/export-floating-success.png' })
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('floating export error provides a working document-copy rescue action', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T12:34:56.789Z'))
  await page.context().route('**/src/lib/pdf.worker.ts*', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save document copy', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('The Quiet Hours_2026-09-14_12-34-56-789Z.scripy')
  await expect(page.getByRole('status')).toContainText('Document copy saved.')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('dark floating errors remain readable and interactive at mobile widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await page.context().route('**/src/lib/pdf.worker.ts*', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  const bounds = await page.getByRole('alert').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: 'test-results/export-floating-error-mobile.png' })
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('each successful export produces a fresh floating success notification', async ({ page }) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    await downloaded
    await expect(page.getByRole('status')).toHaveText('PDF exported.')
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click()
    await expect(page.getByRole('status')).toHaveCount(0)
  }
})
