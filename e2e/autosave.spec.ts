import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.status-saved')).toBeVisible()
  const now = new Date()
  await page.clock.install({ time: now })
  await page.clock.pauseAt(new Date(now.getTime() + 1000))
})

for (const saveMethod of ['autosave', 'Ctrl+S']) {
  test(`${saveMethod} retries a temporary storage failure without another edit or manual save`, async ({
    page,
  }) => {
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      let failOnce = true
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
        if (this.name === 'projects' && failOnce) {
          failOnce = false
          throw new DOMException('Temporary storage busy', 'UnknownError')
        }
        return put.apply(this, args)
      }
    })
    await page.locator('.screenplay-editor p').nth(1).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Automatically recovered.')
    if (saveMethod === 'Ctrl+S') await page.keyboard.press('Control+s')
    else await page.clock.runFor(500)
    await expect(page.locator('.status-error')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Temporary storage busy')
    await page.clock.runFor(1100)
    await expect(page.locator('.status-saved')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(downloads).toEqual([])
    await page.reload()
    await expect(page.locator('.screenplay-editor')).toContainText('Automatically recovered.')
  })
}

test('continuous typing gets an autosave checkpoint without waiting for a pause', async ({ page }) => {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    const saved: string[] = []
    Reflect.set(window, 'autosaveTestWrites', saved)
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'projects') saved.push(JSON.stringify(args[0]))
      return put.apply(this, args)
    }
  })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  for (let index = 0; index < 55; index += 1) {
    await page.keyboard.insertText(' writing')
    await page.clock.runFor(100)
  }
  expect(await page.evaluate(() => Reflect.get(window, 'autosaveTestWrites').length)).toBeGreaterThan(0)
  await page.clock.runFor(500)
  await expect(page.locator('.status-saved')).toBeVisible()
  const text = await page.locator('.screenplay-editor').innerText()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toHaveText(text, { useInnerText: true })
})

test('persistent storage failure stops automatic retries and keeps an explicit retry available', async ({
  page,
}) => {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    let attempts = 0
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'projects') {
        Reflect.set(window, 'autosaveFailureAttempts', ++attempts)
        throw new DOMException('Recovery storage full', 'QuotaExceededError')
      }
      return put.apply(this, args)
    }
    window.addEventListener(
      'restore-autosave-storage',
      () => {
        IDBObjectStore.prototype.put = put
      },
      { once: true },
    )
  })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Keep this despite storage errors.')
  for (const [attempts, delay] of [
    [1, 500],
    [2, 1100],
    [3, 2100],
    [4, 4100],
  ]) {
    await page.clock.runFor(delay)
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'autosaveFailureAttempts')))
      .toBe(attempts)
    await expect(page.locator('.status-error')).toBeVisible()
  }
  await page.clock.fastForward(60000)
  expect(await page.evaluate(() => Reflect.get(window, 'autosaveFailureAttempts'))).toBe(4)
  await expect(page.getByRole('alert')).toContainText('Recovery storage full')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => window.dispatchEvent(new Event('restore-autosave-storage')))
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Keep this despite storage errors.')
})

test('desktop file autosave is still attempted when the local recovery database is full', async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.set(window, 'scripyDesktop', {
      autosave: async (content: string) => {
        Reflect.set(window, 'autosaveDiskContent', content)
        return true
      },
    })
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'projects') throw new DOMException('Local recovery unavailable', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Still save the native file.')
  await page.clock.runFor(500)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'autosaveDiskContent')))
    .toContain('Still save the native file.')
  await expect(page.locator('.status-error')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Local recovery unavailable')
  await expect(page.locator('.screenplay-editor')).toContainText('Still save the native file.')
})

test('edits made during a slow native save are saved next without overlapping writes or a false saved state', async ({
  page,
}) => {
  await page.evaluate(() => {
    const saved: string[] = []
    const finish: Array<(result: boolean) => void> = []
    Reflect.set(window, 'slowAutosaveWrites', saved)
    Reflect.set(window, 'finishAutosaveWrite', () => finish.shift()?.(true))
    Reflect.set(window, 'scripyDesktop', {
      autosave: (content: string) => {
        saved.push(content)
        return new Promise<boolean>((resolve) => finish.push(resolve))
      },
    })
  })
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' First slow save.')
  await page.clock.runFor(500)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'slowAutosaveWrites').length)).toBe(1)
  await page.keyboard.insertText(' Newer edit while saving.')
  await page.clock.fastForward(6000)
  expect(await page.evaluate(() => Reflect.get(window, 'slowAutosaveWrites').length)).toBe(1)
  await expect(page.locator('.status-saved')).toHaveCount(0)
  await page.evaluate(() => Reflect.get(window, 'finishAutosaveWrite')())
  await page.clock.runFor(500)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'slowAutosaveWrites').length)).toBe(2)
  await expect(page.locator('.status-saved')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, 'slowAutosaveWrites')[1])).toContain(
    'Newer edit while saving.',
  )
  await page.evaluate(() => Reflect.get(window, 'finishAutosaveWrite')())
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.evaluate(() => Reflect.deleteProperty(window, 'scripyDesktop'))
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('First slow save. Newer edit while saving.')
})

test('an immediate reload recovers the edit before the idle autosave timer fires', async ({ page }) => {
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' Immediate reload recovery.')
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Immediate reload recovery.')
})

test('scene memos autosave without clicking Save memo or pressing Ctrl+S', async ({ page }) => {
  const memo = page.locator('#scene-notes')
  await memo.fill('A scene memo saved automatically.')
  await page.clock.runFor(500)
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(memo).toHaveValue('A scene memo saved automatically.')
})
