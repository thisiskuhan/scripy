import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function failLocalWrites(page: Page, emergency = false) {
  await page.evaluate((blockEmergency) => {
    const put = IDBObjectStore.prototype.put
    const set = Storage.prototype.setItem
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Injected local quota exceeded', 'QuotaExceededError')
    }
    if (blockEmergency)
      Storage.prototype.setItem = function (key, value) {
        if (key === 'scripy.emergency.v1')
          throw new DOMException('Emergency storage full', 'QuotaExceededError')
        return set.call(this, key, value)
      }
    window.addEventListener(
      'restore-test-storage',
      () => {
        IDBObjectStore.prototype.put = put
        Storage.prototype.setItem = set
      },
      { once: true },
    )
  }, emergency)
}

async function typeMarker(page: Page, text: string) {
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

test('quota failure keeps the text editable and Retry save recovers it durably', async ({ page }) => {
  await failLocalWrites(page)
  await typeMarker(page, ' A recoverable edit.')
  await expect(page.locator('.status-error')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Injected local quota exceeded')
  await expect(page.locator('.screenplay-editor')).toContainText('A recoverable edit.')
  await typeMarker(page, ' Still writing.')
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('A recoverable edit. Still writing.')
})

test('Save document still downloads a rescue copy when both recovery stores fail', async ({ page }) => {
  await failLocalWrites(page, true)
  await typeMarker(page, ' Rescue this text.')
  await expect(page.locator('.status-error')).toBeVisible()
  const pending = page.waitForEvent('download', { timeout: 5000 })
  await page.getByRole('button', { name: 'Save document', exact: true }).click()
  const download = await pending
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).blocks[1].text).toContain('Rescue this text.')
  await expect(page.locator('.status-error')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.locator('.status-saved')).toBeVisible()
})

test('recovery history remains readable while writes are failing', async ({ page }) => {
  await failLocalWrites(page)
  await typeMarker(page, ' Cannot save yet.')
  await expect(page.locator('.status-error')).toBeVisible()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Initial draft' })).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
})

test('a failed snapshot restore preserves the current draft and can be retried', async ({ page }) => {
  await typeMarker(page, ' Preserve this draft until recovery succeeds.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await failLocalWrites(page)
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const initial = page.locator('.snapshot-row').filter({ hasText: 'Initial draft' })
  await initial.getByRole('button', { name: 'Restore', exact: true }).click()
  await initial.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Injected local quota exceeded')
  await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toBeEnabled()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toContainText(
    'Preserve this draft until recovery succeeds.',
  )
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await initial.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).not.toContainText(
    'Preserve this draft until recovery succeeds.',
  )
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Before recovery' })).toHaveCount(1)
})

test('failed document creation cannot replace the active screenplay', async ({ page }) => {
  const before = await page.locator('.screenplay-editor').innerText()
  await failLocalWrites(page)
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Must not replace the draft')
  await page.getByRole('button', { name: 'Create screenplay', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Injected local quota exceeded')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await page.locator('.screenplay-editor').innerText()).toBe(before)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
})

test('PDF font download failures are visible and retry succeeds', async ({ page }) => {
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.route('**/fonts/*.ttf', (route) =>
    route.fulfill({ status: 503, body: 'Temporarily unavailable' }),
  )
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('typeface could not be loaded')
  expect(downloads).toEqual([])
  await page.unroute('**/fonts/*.ttf')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  expect((await pending).suggestedFilename()).toBe('The Quiet Hours.pdf')
})

for (const { moduleName, response } of [
  { moduleName: 'pdf.ts', response: 'network failure' },
  { moduleName: 'pdf.worker.ts', response: 'network failure' },
  { moduleName: 'pdf.ts', response: 'wrong app HTML' },
]) {
  test(`PDF module download failure (${moduleName}, ${response}) can be retried without reloading or losing edits`, async ({
    page,
  }) => {
    await typeMarker(page, ' Keep this unsaved export retry marker.')
    const before = await page.locator('.screenplay-editor').innerText()
    const urls: string[] = []
    const modulePattern = `**/src/lib/${moduleName}*`
    await page.route(modulePattern, (route) => {
      urls.push(route.request().url())
      return response === 'wrong app HTML'
        ? route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><title>Another app</title>',
          })
        : route.abort('failed')
    })
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('click Export PDF again')
    expect(urls.length).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled()
    const firstAttemptCount = urls.length
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('click Export PDF again')
    expect(urls.length).toBeGreaterThan(firstAttemptCount)
    await page.unroute(modulePattern)
    const pending = page.waitForEvent('download', { timeout: 7000 })
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('The Quiet Hours.pdf')
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-')
    expect(await page.locator('.screenplay-editor').innerText()).toBe(before)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.locator('.screenplay-editor')).not.toContainText(
      'Keep this unsaved export retry marker.',
    )
  })
}

test('malformed UTF-8 file import leaves the current draft unchanged', async ({ page }) => {
  const original = await page.locator('.screenplay-editor').innerText()
  const source = {
    version: 1,
    id: 'bad-encoding',
    title: 'Invalid text',
    author: '',
    draft: 'First draft',
    logline: '',
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    notes: {},
    blocks: [{ id: 'first', kind: 'action', text: 'Original bytes.' }],
  }
  const buffer = Buffer.from(JSON.stringify(source))
  buffer[buffer.indexOf('Original bytes.')] = 0xff
  await page
    .getByLabel('Open screenplay file', { exact: true })
    .setInputFiles({ name: 'bad-encoding.scripy', mimeType: 'application/json', buffer })
  await expect(page.getByRole('alert')).toContainText('UTF-8')
  expect(await page.locator('.screenplay-editor').innerText()).toBe(original)
})

test('an oversized paste is rejected before entering an unsavable state', async ({ page }) => {
  const original = await page.locator('.screenplay-editor').innerText()
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.locator('.screenplay-editor').evaluate((element) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'x'.repeat(100001))
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.getByRole('alert')).toContainText('limit')
  expect(await page.locator('.screenplay-editor').innerText()).toBe(original)
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.status-error')).toHaveCount(0)
})

test('read-only tabs reject keyboard formatting and undo commands', async ({ context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  const paragraph = other.locator('.screenplay-editor p').first()
  const original = await other.locator('.screenplay-editor').innerText()
  await paragraph.click()
  await other.keyboard.press('Alt+4')
  await other.keyboard.press('Enter')
  await other.keyboard.press('Tab')
  await other.keyboard.press('Control+z')
  expect(await other.locator('.screenplay-editor').innerText()).toBe(original)
  await expect(paragraph).toHaveAttribute('data-kind', 'scene')
  await other.close()
})

test('repeated Export commands produce one download while the first export is pending', async ({ page }) => {
  let unblock: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  let entered: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  await page.route('**/fonts/*.ttf', async (route) => {
    entered()
    await gate
    await route.continue()
  })
  const downloads: string[] = []
  page.on('download', (item) => downloads.push(item.suggestedFilename()))
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await waiting
  await expect(page.getByRole('button', { name: 'Exporting...', exact: true })).toBeDisabled()
  const pending = page.waitForEvent('download')
  unblock()
  await pending
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(downloads).toHaveLength(1)
})
