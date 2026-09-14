import { expect, test, type Page } from './fixtures'

async function resize(page: Page, name: string, distance: number) {
  const handle = page.getByRole('separator', { name, exact: true })
  const bounds = await handle.boundingBox()
  const start = bounds!.x + bounds!.width / 2
  const top = bounds!.y + bounds!.height / 2
  await page.mouse.move(start, top)
  await page.mouse.down()
  await page.mouse.move(start + distance, top, { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
})

test('both sidebars resize, collapse, restore, and remember widths without resetting the draft', async ({
  page,
}) => {
  const navigation = page.getByRole('complementary', { name: 'Screenplay navigation', exact: true })
  const notes = page.getByRole('complementary', { name: 'Scene notes', exact: true })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Kept while resizing.')
  const originalNote = await page.locator('#scene-notes').inputValue()
  await resize(page, 'Resize navigation', 80)
  await expect(navigation).toHaveCSS('width', '318px')
  await resize(page, 'Resize notes', -96)
  await expect(notes).toHaveCSS('width', '416px')
  await page.getByRole('button', { name: 'Hide navigation', exact: true }).click()
  await expect(navigation).toBeHidden()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(navigation).toHaveCSS('width', '318px')
  await page.getByRole('button', { name: 'Hide scene notes', exact: true }).click()
  await expect(notes).toBeHidden()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  await expect(notes).toHaveCSS('width', '416px')
  await expect(page.locator('#scene-notes')).toHaveValue(originalNote)
  await expect(page.locator('.screenplay-editor')).toContainText('Kept while resizing.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).not.toContainText('Kept while resizing.')
  await page.getByRole('button', { name: 'Hide navigation', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('scripy.panel-layout') || '{}')))
    .toMatchObject({ navigationWidth: 318, notesWidth: 416, navigationCollapsed: true })
  await page.reload()
  await expect(navigation).toBeHidden()
  await expect(notes).toHaveCSS('width', '416px')
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(navigation).toHaveCSS('width', '318px')
})

test('keyboard resizing and dragging respect minimums and preserve editor space', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 })
  const navigation = page.getByRole('separator', { name: 'Resize navigation', exact: true })
  const notes = page.getByRole('separator', { name: 'Resize notes', exact: true })
  await navigation.focus()
  await navigation.press('Home')
  await expect(navigation).toHaveAttribute('aria-valuenow', '200')
  await navigation.press('ArrowRight')
  await expect(navigation).toHaveAttribute('aria-valuenow', '210')
  await notes.focus()
  await notes.press('Home')
  await expect(notes).toHaveAttribute('aria-valuenow', '240')
  await notes.press('ArrowLeft')
  await expect(notes).toHaveAttribute('aria-valuenow', '250')
  await resize(page, 'Resize notes', -1000)
  expect((await page.locator('.main-panel').boundingBox())!.width).toBeGreaterThanOrEqual(480)
  await resize(page, 'Resize navigation', 1000)
  expect((await page.locator('.main-panel').boundingBox())!.width).toBeGreaterThanOrEqual(480)
  await notes.dblclick()
  await expect(notes).toHaveAttribute('aria-valuenow', '320')
})

test('maximum sidebar widths keep toolbars reachable and collapsing notes preserves memo undo', async ({
  page,
}) => {
  await resize(page, 'Resize navigation', 600)
  await resize(page, 'Resize notes', -600)
  const clipped = await page.locator('.view-bar, .editor-toolbar').evaluateAll((bars) =>
    bars.flatMap((bar) => {
      const area = bar.getBoundingClientRect()
      return [...bar.querySelectorAll<HTMLElement>('button:not(:disabled), select')].flatMap((control) => {
        const bounds = control.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return []
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        return bounds.left < area.left || bounds.right > area.right || !hit || !control.contains(hit)
          ? [control.getAttribute('aria-label') || control.textContent]
          : []
      })
    }),
  )
  expect(clipped).toEqual([])
  const note = page.locator('#scene-notes')
  const original = await note.inputValue()
  await note.click()
  await note.press('Control+End')
  await page.keyboard.type(' Keep this note history.')
  const edited = `${original} Keep this note history.`
  await expect(note).toHaveValue(edited)
  await page.getByRole('button', { name: 'Hide scene notes', exact: true }).click()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  await note.click()
  await note.press('Control+z')
  await expect(note).not.toHaveValue(edited)
  await note.press('Control+Shift+z')
  await expect(note).toHaveValue(edited)
  await page.screenshot({ path: 'test-results/resizable-sidebars.png' })
})

test('mobile drawers stay dismissible and resizing stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  const navigation = page.getByRole('complementary', { name: 'Screenplay navigation', exact: true })
  await resize(page, 'Resize navigation', 300)
  expect((await navigation.boundingBox())!.width).toBeLessThanOrEqual(350)
  await navigation.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  const notes = page.getByRole('complementary', { name: 'Scene notes', exact: true })
  await resize(page, 'Resize notes', -300)
  expect((await notes.boundingBox())!.width).toBeLessThanOrEqual(350)
  await notes.getByRole('button', { name: 'Close scene notes', exact: true }).click()
  await expect(notes).toBeHidden()
  await expect(page.getByRole('button', { name: 'Show scene notes', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
