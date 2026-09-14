import { expect, test } from '@playwright/test'
import { sampleScreenplay } from '../src/lib/sample'
import { serializeProject } from '../src/lib/screenplay'
import { MOVIE_QUOTES } from '../src/lib/movie-quotes'

test('privacy page keeps its shared Home styles', async ({ page }) => {
  await page.goto('/privacy.html')
  await expect(page.getByRole('heading', { name: 'Privacy & Local Files', exact: true })).toBeVisible()
  await expect(page.locator('.privacy-page')).toHaveCSS('max-width', '760px')
})

test('offline home creates and reopens local screenplays without Google', async ({ page }) => {
  const cloudRequests: string[] = []
  page.on('request', (request) => {
    if (/accounts\.google\.com|googleapis\.com/.test(request.url())) cloudRequests.push(request.url())
  })
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(home).toBeVisible()
  await expect(page.locator('.home-page .login-studio')).toHaveText('Scripy.')
  await expect(home.getByText('No screenplays yet.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await expect(page.locator('.screenplay-editor')).toBeHidden()
  await home.getByRole('button', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('An Offline Story')
  await page.getByRole('button', { name: 'Create screenplay', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await page.locator('.screenplay-editor p').first().click()
  await page.keyboard.type('INT. STUDIO - DAY')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(home.getByRole('button', { name: 'Open An Offline Story', exact: true })).toBeVisible()
  await expect(home.locator('.home-recent-item')).toHaveCount(1)
  await page.reload()
  await expect(home).toBeVisible()
  await home.getByRole('button', { name: 'Open An Offline Story', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toContainText('INT. STUDIO - DAY')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Google Drive|Sign out/ })).toHaveCount(0)
  expect(cloudRequests).toEqual([])
})

test('home shows a saving notification that can be dismissed for now or forever', async ({ page }) => {
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  const note = page.getByRole('status').filter({ hasText: 'Autosaved in this browser' })
  await expect(note).toContainText('Clearing site data removes drafts')
  await expect(note).toContainText('Export a .scripy backup')
  await expect(note).toContainText('Ctrl')
  await expect(home.getByRole('note')).toHaveCount(0)
  await expect(page.locator('.floating-notifications')).toHaveCount(1)
  await expect(page.locator('.floating-notifications')).toHaveCSS('position', 'fixed')
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const noticeBounds = (await note.boundingBox())!
    expect(noticeBounds.y).toBeGreaterThan(viewport.height / 2)
    expect(noticeBounds.x).toBeGreaterThanOrEqual(0)
    expect(noticeBounds.x + noticeBounds.width).toBeLessThanOrEqual(viewport.width)
    expect(noticeBounds.y + noticeBounds.height).toBeLessThan(viewport.height)
    await page.screenshot({ path: `test-results/home-saving-popup-${viewport.width}.png` })
  }
  await page.evaluate(() => document.fonts.ready)
  const homeBounds = await home.boundingBox()
  await note.getByRole('button', { name: 'Dismiss note', exact: true }).click()
  await expect(note).toBeHidden()
  expect(await home.boundingBox()).toEqual(homeBounds)
  await page.reload()
  await expect(note).toBeVisible()
  await home.getByRole('button', { name: 'Download desktop app', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Download the desktop app' })).toBeVisible()
  await expect(note).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(note).toBeVisible()
  await home.getByRole('button', { name: 'New screenplay', exact: true }).click()
  await expect(note).toBeHidden()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(note).toBeVisible()
  await note.getByRole('button', { name: /Don.t show this again/, exact: true }).click()
  await expect(note).toBeHidden()
  await page.reload()
  await expect(home).toBeVisible()
  await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  await expect(note).toHaveCount(0)
})

test('home opens a desktop download modal listing every OS', async ({ page }) => {
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await home.getByRole('button', { name: 'Download desktop app', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Download the desktop app' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Windows')
  await expect(dialog).toContainText('macOS')
  await expect(dialog).toContainText('AppImage')
  await expect(dialog).toContainText('.deb')
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('cancelled creation and invalid imports leave a new home empty', async ({ page }) => {
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await home.getByRole('button', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await home.getByRole('button', { name: 'Open file', exact: true }).click()
  await (
    await chooser
  ).setFiles({ name: 'invalid.scripy', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await expect(home).toBeVisible()
  await expect(home.locator('.home-recent-item')).toHaveCount(0)
  await page.reload()
  await expect(home.getByText('No screenplays yet.', { exact: true })).toBeVisible()
})

test('home file import, filtering, and returning to a draft preserve text and undo', async ({ page }) => {
  await page.goto('/')
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  const chooser = page.waitForEvent('filechooser')
  await home.getByRole('button', { name: 'Open file', exact: true }).click()
  await (
    await chooser
  ).setFiles({
    name: 'The Quiet Hours.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeProject(sampleScreenplay())),
  })
  const editor = page.locator('.screenplay-editor')
  await expect(editor).toBeVisible()
  await editor.locator('p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Offline home keeps this edit.')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toHaveCount(0)
  await home.getByRole('searchbox', { name: 'Search recent screenplays' }).fill('missing title')
  await expect(home.getByText('No matching screenplays.', { exact: true })).toBeVisible()
  await home.getByRole('searchbox', { name: 'Search recent screenplays' }).fill('quiet')
  await home.getByRole('button', { name: 'Open The Quiet Hours', exact: true }).click()
  await expect(editor).toContainText('Offline home keeps this edit.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(editor).not.toContainText('Offline home keeps this edit.')
})

test('quote attribution stays close for short and wrapped quotes', async ({ page }) => {
  const byLength = MOVIE_QUOTES.map((quote, index) => ({
    index,
    length: quote.text.length + quote.highlight.length,
  })).sort((first, second) => first.length - second.length)
  for (const selected of [byLength[0], byLength[byLength.length - 1]]) {
    await page.addInitScript(
      (random) => {
        sessionStorage.removeItem('scripy.login-quote')
        Math.random = () => random
      },
      (selected.index + 0.5) / MOVIE_QUOTES.length,
    )
    await page.goto('/')
    const quote = page.locator('.home-page .login-quote blockquote')
    const attribution = page.locator('.home-page .login-quote figcaption')
    await expect(quote).toContainText(MOVIE_QUOTES[selected.index].highlight)
    await page.evaluate(() => document.fonts.ready)
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const quoteBounds = (await quote.boundingBox())!
      const captionBounds = (await attribution.boundingBox())!
      const lineHeight = await quote.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).lineHeight),
      )
      expect(captionBounds.y - (quoteBounds.y + quoteBounds.height)).toBeCloseTo(12, 0)
      if (selected === byLength[0]) expect(quoteBounds.height).toBeCloseTo(lineHeight, 0)
      else if (width === 320) expect(quoteBounds.height).toBeGreaterThan(lineHeight * 2)
    }
    await page.screenshot({
      path: `test-results/home-quote-${selected === byLength[0] ? 'short' : 'long'}.png`,
    })
  }
})

test('download stays in place with room for every quote', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home-download-button')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  for (const width of [320, 390, 600, 768, 900, 901, 1024, 1100, 1101, 1360, 1366, 1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const positions = await page.locator('.home-intro').evaluate((intro, quotes) => {
      const blockquote = intro.querySelector('blockquote')!
      const caption = intro.querySelector('figcaption')!
      const film = caption.querySelector('cite')!
      const year = caption.lastElementChild!
      const download = intro.querySelector('.home-download')!
      const [opening, highlight, closing] = [...blockquote.children]
      return quotes.map((quote) => {
        highlight.textContent = quote.highlight
        blockquote.replaceChildren(opening, document.createTextNode(quote.text), highlight, closing)
        film.textContent = quote.film
        year.textContent = `(${quote.year})`
        const buttonBounds = download.getBoundingClientRect()
        const captionBounds = caption.getBoundingClientRect()
        return {
          film: quote.film,
          top: buttonBounds.top + scrollY,
          left: buttonBounds.left,
          gap: buttonBounds.top - captionBounds.bottom,
          overflow: Math.max(
            intro.scrollWidth - intro.clientWidth,
            blockquote.scrollWidth - blockquote.clientWidth,
          ),
        }
      })
    }, MOVIE_QUOTES)
    const tops = positions.map((position) => position.top)
    expect(Math.max(...tops) - Math.min(...tops), `Button moves at ${width}px`).toBeLessThan(1)
    expect(positions.every((position) => position.left === positions[0].left)).toBe(true)
    expect(
      Math.min(...positions.map((position) => position.gap)),
      `Quote overlaps at ${width}px`,
    ).toBeGreaterThanOrEqual(27)
    for (const position of positions)
      expect(position.overflow, `${position.film} quote overflows at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('home keeps split layout and long titles responsive in both themes', async ({ page }) => {
  await page.goto('/')
  const project = sampleScreenplay()
  project.title = 'A Long Journey Through a City That Never Sleeps and the Quiet Hours Before Dawn'
  await expect(page.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name: 'long-title.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeProject(project)),
  })
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  const dismissNote = page.getByRole('button', { name: 'Dismiss note', exact: true })
  await expect(dismissNote).toBeVisible()
  await dismissNote.click()
  const intro = page.locator('.home-intro')
  const library = page.locator('.home-library')
  await expect(intro.locator('.login-quote')).toBeVisible()
  await expect(intro.getByRole('button', { name: 'Download desktop app', exact: true })).toBeVisible()
  await expect(library.getByRole('button', { name: 'New screenplay', exact: true })).toBeVisible()
  await expect(library.getByRole('button', { name: 'Open file', exact: true })).toBeVisible()
  await expect(library.getByRole('region', { name: 'Recent screenplays' })).toBeVisible()
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.keyboard.press('Alt+t')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const issues = await page
        .locator(
          '.home-intro, .home-library, .home-actions, .home-actions .button, .home-recent-item, .home-recent-heading, .login-quote, .home-download',
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const bounds = element.getBoundingClientRect()
              return (
                bounds.left < 0 || bounds.right > innerWidth || element.scrollWidth > element.clientWidth + 1
              )
            })
            .map((element) => element.className),
        )
      expect(issues).toEqual([])
      const introBounds = (await intro.boundingBox())!
      const libraryBounds = (await library.boundingBox())!
      if (viewport.width > 900) {
        expect(introBounds.width).toBeCloseTo(libraryBounds.width, 0)
        expect(libraryBounds.x).toBeGreaterThanOrEqual(introBounds.x + introBounds.width - 1)
        expect(introBounds.y + introBounds.height / 2).toBeCloseTo(
          libraryBounds.y + libraryBounds.height / 2,
          0,
        )
        await expect(intro.locator('blockquote')).toHaveCSS('font-size', '64px')
      } else {
        expect(introBounds.y).toBeGreaterThanOrEqual(libraryBounds.y + libraryBounds.height)
      }
      await page.getByRole('button', { name: `Open ${project.title}`, exact: true }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('button', { name: `Open ${project.title}`, exact: true })).toBeInViewport({
        ratio: 1,
      })
      await page.screenshot({ path: `test-results/home-${viewport.width}-${theme}.png`, fullPage: true })
    }
  }
})
