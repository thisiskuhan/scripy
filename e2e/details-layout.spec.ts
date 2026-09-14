import { expect, test } from './fixtures'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
})

test('details use a wide desktop layout with live preview and visible save actions', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Screenplay details' })
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeGreaterThanOrEqual(860)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  const fields = await title.boundingBox()
  const preview = await page.getByRole('region', { name: 'Title page', exact: true }).boundingBox()
  expect(fields!.x + fields!.width).toBeLessThan(preview!.x)
  await expect(page.getByRole('button', { name: 'Save details', exact: true })).toBeInViewport({ ratio: 1 })
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  await title.fill('A Window Over The City')
  await page.getByRole('textbox', { name: 'Written by', exact: true }).fill('Kuhan')
  await page.getByRole('textbox', { name: 'Draft', exact: true }).fill('Second draft')
  await page
    .getByRole('textbox', { name: 'Logline', exact: true })
    .fill('Two strangers share a view of a changing city.')
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('a4')
  await page
    .getByLabel('Title-page image file', { exact: true })
    .setInputFiles(path.resolve('e2e/fixtures/title-1080p.png'))
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
  await expect(page.locator('.title-preview')).toContainText('A Window Over The City')
  await expect(page.locator('.title-preview')).toContainText('Kuhan')
  await page.screenshot({ path: 'test-results/details-wide-desktop.png' })
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(title).toHaveValue('A Window Over The City')
  await expect(page.getByRole('textbox', { name: 'Draft', exact: true })).toHaveValue('Second draft')
  await expect(page.getByRole('textbox', { name: 'Logline', exact: true })).toHaveValue(
    'Two strangers share a view of a changing city.',
  )
  await expect(page.getByRole('combobox', { name: 'Paper size', exact: true })).toHaveValue('a4')
  await expect(page.getByRole('img', { name: 'Title-page artwork', exact: true })).toBeVisible()
})

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`details keep actions accessible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    if (viewport.width === 390)
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    await page.getByRole('button', { name: 'Document menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Document details', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Screenplay details' })
    const save = page.getByRole('button', { name: 'Save details', exact: true })
    await expect(save).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const content = page.locator('.details-content')
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.getByRole('button', { name: 'Add image', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: 'Add image', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(save).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/details-${viewport.width}x${viewport.height}.png` })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveTitle('The Quiet Hours - Scripy')
  })
}
