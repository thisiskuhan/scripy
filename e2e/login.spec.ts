import { expect, test } from '@playwright/test'
import { mockGoogle, signIn } from './helpers/google'
import { createScreenplay, serializeProject } from '../src/lib/screenplay'
import { MOVIE_QUOTES } from '../src/lib/movie-quotes'
import { CLOUD_FEATURES_ENABLED } from '../src/lib/deployment'

test.skip(!CLOUD_FEATURES_ENABLED, 'Google sign-in and Drive are parked for the offline desktop edition.')

test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    ),
  ).toBe(true)
})

test('web requires sign-in before opening any screenplay', async ({ page }) => {
  await mockGoogle(page)
  await page.goto('/')
  await expect(page.getByRole('main', { name: 'Sign in to Scripy' })).toBeVisible()
  await expect(page.locator('.login-page .wordmark, .login-header img')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sign in to Scripy', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download local app' })).toBeVisible()
  await expect(page.locator('.login-quote blockquote')).not.toBeEmpty()
  const quote = await page.locator('.login-quote blockquote').innerText()
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expect(page.locator('.login-quote blockquote')).toHaveText(quote)
  await page.getByRole('button', { name: 'Download local app' }).click()
  await expect(page.getByRole('status')).toContainText('coming soon')
  await page.reload()
  await expect(page.locator('.login-quote blockquote')).not.toHaveText(quote)
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
})

test('verified Google sign-in opens the account workspace and sign-out preserves local edits', async ({
  page,
}) => {
  await mockGoogle(page)
  await page.goto('/')
  await signIn(page)
  expect(await page.evaluate(() => Reflect.get(window, '__googleRequestedScope'))).toContain(
    'https://www.googleapis.com/auth/drive.file',
  )
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Private account edit.')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Sign in to Scripy' })).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
        value.includes('scripy-e2e-token'),
      ),
    ),
  ).toBe(false)
  await signIn(page)
  await expect(page.locator('.screenplay-editor')).toContainText('Private account edit.')
})

test('denying Drive permission keeps the web workspace locked', async ({ page }) => {
  await mockGoogle(page, { scope: 'openid email profile' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('alert')).toContainText('Allow access to Scripy files')
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
})

test('popup cancellation and rejected Google verification never unlock the editor', async ({ page }) => {
  await mockGoogle(page, { popupError: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('alert')).toContainText('window was closed')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  await mockGoogle(page, { userStatus: 401 })
  await page.reload()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be verified')
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
})

test('switching Google accounts does not expose another account draft or history', async ({ page }) => {
  const account = await mockGoogle(page)
  await page.goto('/')
  await signIn(page)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Account one private text.')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  account.sub = 'another-writer'
  account.email = 'other@example.com'
  await signIn(page)
  await expect(page.locator('.screenplay-editor')).not.toContainText('Account one private text.')
  await page.getByRole('button', { name: 'Recovery history' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('Before signing out')
})

test('Drive copy actions upload real screenplay data and validate downloaded files', async ({ page }) => {
  await mockGoogle(page)
  const fromDrive = createScreenplay('From Google Drive')
  fromDrive.blocks[0].text = 'INT. STATION - DAY'
  const copy = {
    id: 'cloud-copy',
    name: 'From Google Drive.scripy',
    size: 800,
    modifiedTime: '2026-09-14T12:00:00.000Z',
  }
  let uploaded = ''
  let content = '{'
  await page.route('https://www.googleapis.com/upload/drive/v3/files?**', (route) => {
    uploaded = route.request().postData() || ''
    return route.fulfill({ json: copy })
  })
  await page.route('https://www.googleapis.com/drive/v3/files?**', (route) =>
    route.fulfill({ json: { files: [copy] } }),
  )
  await page.route('https://www.googleapis.com/drive/v3/files/cloud-copy?alt=media', (route) =>
    route.fulfill({ contentType: 'application/json', body: content }),
  )
  await page.goto('/')
  await signIn(page)
  const original = await page.locator('.screenplay-editor').innerText()
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save copy to Google Drive', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Copy saved to Google Drive')
  expect(uploaded).toContain('The Quiet Hours')
  expect(uploaded).toContain('"application":"scripy"')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open from Google Drive', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Google Drive', exact: true })
  await dialog.getByRole('button', { name: /From Google Drive.scripy/ }).click()
  await expect(dialog.getByRole('alert')).toContainText('not valid JSON')
  expect(await page.locator('.screenplay-editor').innerText()).toBe(original)
  content = serializeProject(fromDrive)
  await dialog.getByRole('button', { name: /From Google Drive.scripy/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Document menu', exact: true })).toContainText(
    'From Google Drive',
  )
})

test('expired sessions lock the editor and retain the last pending edit', async ({ page }) => {
  await mockGoogle(page)
  await page.clock.install()
  await page.goto('/')
  await signIn(page)
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Kept across session expiry.')
  await page.clock.fastForward(3601000)
  await expect(page.getByRole('main', { name: 'Sign in to Scripy' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('session expired')
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
  await signIn(page)
  await expect(page.locator('.screenplay-editor')).toContainText('Kept across session expiry.')
})

test('highlight follows the pointer and respects reduced motion', async ({ page }) => {
  await mockGoogle(page)
  await page.goto('/')
  const dots = page.locator('.hero-dots-active')
  await expect(page.locator('.hero-dots:not(.hero-dots-active)')).toHaveCSS('opacity', '0.2')
  await expect(dots).toHaveCSS('opacity', '0')
  const initial = await dots.evaluate((element) => getComputedStyle(element).maskImage)
  await page.mouse.move(240, 200)
  await expect.poll(() => dots.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe(initial)
  await expect(dots).toHaveCSS('opacity', '1')
  await page.mouse.move(-10, -10)
  await expect(dots).toHaveCSS('opacity', '0')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(dots).toHaveCount(0)
  await expect(page.locator('.quote-highlight')).toHaveCSS('background-size', '100% 100%')
})

test.describe('touch highlight', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('dots brighten at the touch and fade after release or cancellation', async ({ page }) => {
    await mockGoogle(page)
    await page.goto('/')
    const hero = page.locator('.hero-highlight')
    const dots = page.locator('.hero-dots-active')
    const touch = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 160,
      clientY: 130,
      buttons: 1,
    }
    await expect(dots).toHaveCSS('opacity', '0')
    await hero.dispatchEvent('pointerdown', touch)
    await expect(dots).toHaveCSS('opacity', '1')
    await expect
      .poll(() => dots.evaluate((element) => getComputedStyle(element).maskImage))
      .toContain('160px 130px')
    await hero.dispatchEvent('pointermove', { ...touch, clientX: 200, clientY: 150 })
    await expect
      .poll(() => dots.evaluate((element) => getComputedStyle(element).maskImage))
      .toContain('200px 150px')
    await hero.dispatchEvent('pointerup', { ...touch, buttons: 0 })
    await expect(dots).toHaveCSS('opacity', '0')
    await hero.dispatchEvent('pointerdown', touch)
    await expect(dots).toHaveCSS('opacity', '1')
    await hero.dispatchEvent('pointercancel', touch)
    await expect(dots).toHaveCSS('opacity', '0')
    await page.touchscreen.tap(160, 130)
    await expect(dots).toHaveCSS('opacity', '0')
    await expect(page.locator('.screenplay-editor')).toHaveCount(0)
  })
})

test('privacy is public while returning to the editor still requires sign-in', async ({ page }) => {
  await mockGoogle(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Privacy & Google Drive', exact: true })).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to Scripy' }).click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveCount(0)
})

test('Drive actions and sign-out remain reachable in a short landscape menu', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await mockGoogle(page)
  await page.goto('/')
  await signIn(page)
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeInViewport({ ratio: 1 })
  for (const label of [
    'Save copy to Google Drive',
    'Open from Google Drive',
    'Download local app',
    'Sign out',
  ]) {
    const item = menu.getByRole('menuitem', { name: label, exact: true })
    await item.scrollIntoViewIfNeeded()
    await expect(item).toBeInViewport({ ratio: 1 })
  }
  await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Sign in to Scripy' })).toBeVisible()
})

test('long quotes, sign-in, and download controls fit desktop, tablet, and phone themes', async ({
  page,
}) => {
  await mockGoogle(page)
  const longest = MOVIE_QUOTES.reduce(
    (selected, quote, index) =>
      quote.text.length + quote.highlight.length >
      MOVIE_QUOTES[selected].text.length + MOVIE_QUOTES[selected].highlight.length
        ? index
        : selected,
    0,
  )
  await page.addInitScript(
    (random) => {
      Math.random = () => random
    },
    (longest + 0.1) / MOVIE_QUOTES.length,
  )
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.keyboard.press('Alt+t')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const issues = await page
        .locator('.login-content, .login-actions button, .login-quote blockquote')
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
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Continue with Google' }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeInViewport({ ratio: 1 })
      await page.getByRole('button', { name: 'Download local app' }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('button', { name: 'Download local app' })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `test-results/login-${viewport.width}-${theme}.png`, fullPage: true })
    }
  }
})
