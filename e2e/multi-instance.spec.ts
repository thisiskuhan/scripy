import { chromium, expect, firefox, test, type Page } from '@playwright/test'
import { sampleScreenplay } from '../src/lib/sample'
import { serializeProject, type Screenplay } from '../src/lib/screenplay'

async function importDraft(page: Page, project = sampleScreenplay()) {
  const name = `${project.title}.scripy`
  await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(serializeProject(project)),
  })
  await expect(page.getByRole('status').filter({ hasText: `Imported ${name}` })).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.status-saved')).toBeVisible()
  return project
}

async function openReader(page: Page, title: string) {
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(home).toBeVisible()
  await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeDisabled()
  await expect(home.getByRole('button', { name: 'Open file', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('status').filter({ hasText: 'This workspace is open in another tab.' }),
  ).toBeVisible()
  await home.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
}

async function appendAndSave(page: Page, text: string) {
  await page.bringToFront()
  const paragraph = page.locator('.screenplay-editor p').nth(1)
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  await expect(paragraph).toContainText(text.trim())
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('.status-saved')).toBeVisible()
}

async function recovery(page: Page): Promise<Screenplay> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('scripy.emergency.v1')!))
}

async function writerCount(page: Page) {
  return page.evaluate(async () => {
    const locks = await navigator.locks.query()
    return locks.held?.filter((lock) => lock.name === 'scripy-workspace-writer').length
  })
}

test('a single tab never reports another tab while initializing or refreshing', async ({ page }) => {
  await page.addInitScript(() => {
    const request = navigator.locks.request.bind(navigator.locks)
    const startup = new Promise<void>((resolve) => Reflect.set(window, 'finishLockStartup', resolve))
    Object.defineProperty(navigator.locks, 'request', {
      configurable: true,
      value: (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) =>
        request(name, options, async (lock) => {
          if (lock && name === 'scripy-workspace-writer') {
            Reflect.set(window, 'startupLockHeld', true)
            await startup
          }
          return callback(lock)
        }),
    })
  })
  await page.goto('/')
  for (let visit = 0; visit < 3; visit += 1) {
    if (visit) await page.reload()
    const home = page.getByRole('main', { name: 'Scripy home', exact: true })
    await expect(home).toBeVisible()
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'startupLockHeld'))).toBe(true)
    await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeDisabled()
    await expect(
      page.getByText('This workspace is open in another tab. Editing is paused here.', {
        exact: true,
      }),
    ).toHaveCount(0)
    await page.evaluate(() => Reflect.get(window, 'finishLockStartup')())
    await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
    expect(await writerCount(page)).toBe(1)
  }
})

test('missing Web Locks keeps the workspace read-only', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  })
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(home).toBeVisible()
  await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeDisabled()
  await expect(home.getByRole('button', { name: 'Open file', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('exclusive editing')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
})

test('a rejected writer lock never enables editing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.locks, 'request', {
      configurable: true,
      value: () => Promise.reject(new Error('Injected exclusive editing denial')),
    })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('exclusive editing denial')
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeDisabled()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  expect(await page.evaluate(() => localStorage.getItem('scripy.emergency.v1'))).toBeNull()
})

test('three tabs reject reader writes and hand off only the newest draft', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  const project = await importDraft(page)
  const second = await context.newPage()
  const third = await context.newPage()
  await second.goto('/')
  await openReader(second, project.title)
  await third.goto('/')
  await openReader(third, project.title)
  expect(await writerCount(page)).toBe(1)
  const before = await recovery(page)
  const readerText = await second.locator('.screenplay-editor').innerText()
  const downloads: string[] = []
  second.on('download', (download) => downloads.push(download.suggestedFilename()))
  await second.locator('.screenplay-editor p').nth(1).click()
  await second.keyboard.type('READER MUST NOT WRITE')
  for (const shortcut of ['Alt+4', 'Enter', 'Tab', 'ControlOrMeta+z', 'ControlOrMeta+s'])
    await second.keyboard.press(shortcut)
  expect(await second.locator('.screenplay-editor').innerText()).toBe(readerText)
  expect(await recovery(page)).toEqual(before)
  expect(downloads).toEqual([])
  await appendAndSave(page, ' Saved by the first writer.')
  await page.close({ runBeforeUnload: true })
  await expect(second.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(
    second.getByRole('status').filter({ hasText: 'This workspace is open in another tab.' }),
  ).toHaveCount(0)
  await expect(second.locator('.screenplay-editor')).toContainText('Saved by the first writer.')
  await expect(third.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  await second.locator('.screenplay-editor').focus()
  await second.keyboard.press('ControlOrMeta+z')
  await expect(second.locator('.screenplay-editor')).toContainText('Saved by the first writer.')
  await appendAndSave(second, ' Saved by the second writer.')
  await second.close({ runBeforeUnload: true })
  await expect(third.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(third.locator('.screenplay-editor')).toContainText('Saved by the first writer.')
  await expect(third.locator('.screenplay-editor')).toContainText('Saved by the second writer.')
  expect(await writerCount(third)).toBe(1)
  expect((await recovery(third)).id).toBe(project.id)
})

test('a separate browser window shares the lock and recovers close-time edits', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  const project = await importDraft(page)
  const opened = page.waitForEvent('popup')
  await page.evaluate(() => {
    window.open(location.href, '_blank', 'popup,width=1050,height=720')
  })
  const otherWindow = await opened
  await openReader(otherWindow, project.title)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Close-time handoff.')
  await page.close({ runBeforeUnload: true })
  await expect(otherWindow.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(otherWindow.locator('.screenplay-editor')).toContainText('Close-time handoff.')
  expect(await writerCount(otherWindow)).toBe(1)
})

test('back navigation cannot revive a stale writer', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  const project = await importDraft(page)
  const waiting = await context.newPage()
  await waiting.goto('/')
  await openReader(waiting, project.title)
  await page.goto('/privacy.html')
  await expect(waiting.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await appendAndSave(waiting, ' Written while the original tab was away.')
  await page.goBack()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  if (await page.getByRole('main', { name: 'Scripy home', exact: true }).isVisible())
    await openReader(page, project.title)
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toContainText('Written while the original tab was away.')
  const latest = await recovery(waiting)
  await page.keyboard.press('ControlOrMeta+s')
  expect(await recovery(waiting)).toEqual(latest)
  expect(await writerCount(waiting)).toBe(1)
})

test('simultaneous empty tabs elect exactly one writer and skip closed waiters', async ({ context }) => {
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()])
  await Promise.all(pages.map((page) => page.goto('/')))
  const enabledPages = async () => {
    const enabled = await Promise.all(
      pages.map((page) =>
        page.isClosed()
          ? false
          : page.getByRole('button', { name: 'New screenplay', exact: true }).isEnabled(),
      ),
    )
    return pages.filter((_, index) => enabled[index])
  }
  await expect.poll(async () => (await enabledPages()).length).toBe(1)
  const owner = (await enabledPages())[0]
  const readers = pages.filter((page) => page !== owner)
  await readers[0].close()
  await owner.close({ runBeforeUnload: true })
  await expect(readers[1].getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  expect(await writerCount(readers[1])).toBe(1)
  expect(await readers[1].evaluate(() => localStorage.getItem('scripy.emergency.v1'))).toBeNull()
})

test('different browsers keep same-ID screenplays independent', async ({ page, browserName, baseURL }) => {
  const otherBrowser = await (browserName === 'firefox' ? chromium : firefox).launch()
  try {
    const other = await otherBrowser.newPage({ baseURL })
    await page.goto('/')
    await other.goto('/')
    await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
    await expect(other.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
    const project = sampleScreenplay()
    await importDraft(page, project)
    await importDraft(other, project)
    await appendAndSave(page, ' FIRST BROWSER ONLY')
    await appendAndSave(other, ' SECOND BROWSER ONLY')
    const firstCopy = await recovery(page)
    const secondCopy = await recovery(other)
    expect(firstCopy.id).toBe(secondCopy.id)
    expect(firstCopy.blocks[1].text).toContain('FIRST BROWSER ONLY')
    expect(firstCopy.blocks[1].text).not.toContain('SECOND BROWSER ONLY')
    expect(secondCopy.blocks[1].text).toContain('SECOND BROWSER ONLY')
    expect(secondCopy.blocks[1].text).not.toContain('FIRST BROWSER ONLY')
    expect(await writerCount(page)).toBe(1)
    expect(await writerCount(other)).toBe(1)
    await other.evaluate(() => localStorage.clear())
    expect(await recovery(page)).toEqual(firstCopy)
  } finally {
    await otherBrowser.close()
  }
})

test('a crashed writer releases ownership without losing its acknowledged save', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Renderer crash injection uses the Chromium DevTools protocol.')
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  const project = await importDraft(page)
  const waiting = await context.newPage()
  await waiting.goto('/')
  await openReader(waiting, project.title)
  await appendAndSave(page, ' Durable before renderer crash.')
  const session = await context.newCDPSession(page)
  const crashed = page.waitForEvent('crash')
  void session.send('Page.crash').catch(() => undefined)
  await crashed
  await expect(waiting.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(waiting.locator('.screenplay-editor')).toContainText('Durable before renderer crash.')
  await appendAndSave(waiting, ' The survivor can continue.')
  expect((await recovery(waiting)).blocks[1].text).toContain('The survivor can continue.')
  expect(await writerCount(waiting)).toBe(1)
})
