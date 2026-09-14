import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => {
    const schedule = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 450 ? 60000 : delay, ...args)) as typeof window.setTimeout
  })
})

test('Ctrl+S saves pending changes immediately without downloading a copy', async ({ page }) => {
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Save this without downloading.')
  await expect(page.locator('.save-indicator')).toContainText('Unsaved changes')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toHaveText('Changes saved.')
  await expect(page.locator('.status-saved')).toBeVisible()
  expect(downloads).toEqual([])
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toHaveText('Changes saved.')
  expect(downloads).toEqual([])
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Save this without downloading.')
})

test('Ctrl+S and the file menu save without a toolbar save button or automatic downloads', async ({
  page,
}) => {
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await expect(page.getByRole('button', { name: 'Save document', exact: true })).toHaveCount(0)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Saved with the shortcut.')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toHaveText('Changes saved.')
  await expect(page.locator('.status-saved')).toBeVisible()
  expect(downloads).toEqual([])
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Saved through the menu.')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save document', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Changes saved.')
  expect(downloads).toEqual([])
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download copy', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toMatch(/^The Quiet Hours_.*\.scripy$/)
  expect(await download.failure()).toBeNull()
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(project.blocks[1].text).toContain('Saved with the shortcut. Saved through the menu.')
  expect(downloads).toHaveLength(1)
})

test('failed Ctrl+S keeps unsaved text and retry saves without downloading', async ({ page }) => {
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Keep this pending edit.')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Save storage unavailable', 'QuotaExceededError')
    }
    window.addEventListener(
      'restore-save-storage',
      () => {
        IDBObjectStore.prototype.put = put
      },
      { once: true },
    )
  })
  await page.keyboard.press('Control+s')
  await expect(page.locator('.status-error')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Save storage unavailable')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).toContainText('Keep this pending edit.')
  expect(downloads).toEqual([])
  await page.evaluate(() => window.dispatchEvent(new Event('restore-save-storage')))
  await page.keyboard.press('Control+s')
  await expect(page.locator('.status-saved')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(downloads).toEqual([])
})

test('read-only tabs suppress Ctrl+S without writing or downloading', async ({ page, context }) => {
  const other = await context.newPage()
  const downloads: string[] = []
  other.on('download', (download) => downloads.push(download.suggestedFilename()))
  await other.goto('/')
  await expect(other.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  await other.keyboard.press('Control+s')
  expect(downloads).toEqual([])
  await expect(other.getByText('Changes saved.', { exact: true })).toHaveCount(0)
  await other.close()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
})
