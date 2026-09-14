import { expect, test, type Page } from './fixtures'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test('fullscreen fills the browser display and preserves text and undo on exit', async ({ page }) => {
  const enter = page.getByRole('button', { name: 'Enter fullscreen', exact: true })
  await expect(enter).toHaveAttribute('title', 'Enter fullscreen (F11)')
  await expect(enter).toHaveAttribute('aria-keyshortcuts', 'F11')
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Fullscreen keeps this edit.')
  const text = await page.locator('.screenplay-editor').innerText()
  const ids = await page
    .locator('.screenplay-editor p')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')))
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
    .toBe(true)
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeEnabled()
  expect(await page.locator('.screenplay-editor').innerText()).toBe(text)
  await page.screenshot({ path: 'test-results/studio-fullscreen.png' })
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  expect(
    await page
      .locator('.screenplay-editor p')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id'))),
  ).toEqual(ids)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('Fullscreen keeps this edit.')
})

test('external fullscreen exit updates the control and fullscreen is separate from focus mode', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click()
  await expect(page.locator('.app')).toHaveClass(/focus-mode/)
  await page.evaluate(() => document.exitFullscreen())
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
})

test('denied fullscreen leaves the draft usable and the button can be retried', async ({ page }) => {
  await page.evaluate(() => {
    const request = document.documentElement.requestFullscreen
    document.documentElement.requestFullscreen = async () => {
      throw new DOMException('Denied by browser', 'NotAllowedError')
    }
    window.addEventListener(
      'restore-fullscreen',
      () => {
        document.documentElement.requestFullscreen = request
      },
      { once: true },
    )
  })
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Fullscreen could not be changed')
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeEnabled()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => window.dispatchEvent(new Event('restore-fullscreen')))
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
})

test('fullscreen and appearance buttons fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  const tabs = await page.locator('.view-bar-left').boundingBox()
  const actions = await page.locator('.view-actions').boundingBox()
  expect(tabs!.x + tabs!.width <= actions!.x || tabs!.y + tabs!.height <= actions!.y).toBe(true)
  const toolbar = await page.locator('.editor-toolbar').boundingBox()
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(toolbar!.y)
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Alt+F toggles focus mode and the button advertises the shortcut', async ({ page }) => {
  const focusButton = page.getByRole('button', { name: 'Focus mode', exact: true })
  await expect(focusButton).toHaveAttribute('title', 'Focus mode (Alt+F)')
  await expect(focusButton).toHaveAttribute('aria-keyshortcuts', 'Alt+F')
  await page.locator('.screenplay-editor p').nth(1).click()
  const text = await page.locator('.screenplay-editor').innerText()
  await page.keyboard.press('Alt+f')
  await expect(page.locator('.app')).toHaveClass(/focus-mode/)
  await expect(page.getByRole('button', { name: 'Exit focus', exact: true })).toBeVisible()
  expect(await page.locator('.screenplay-editor').innerText()).toBe(text)
  await page.keyboard.press('Alt+f')
  await expect(page.locator('.app')).not.toHaveClass(/focus-mode/)
  await expect(focusButton).toBeVisible()
})
