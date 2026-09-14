import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Fountain } from 'fountain-js'

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

test('every element selector and element shortcut changes the selected block', async ({ page }) => {
  const block = page.locator('.screenplay-editor p').nth(1)
  await block.click()
  const kinds = ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot']
  for (const kind of kinds) {
    await page.getByRole('combobox', { name: 'Screenplay element', exact: true }).selectOption(kind)
    await expect(block).toHaveAttribute('data-kind', kind)
  }
  for (const [index, kind] of kinds.entries()) {
    await page.keyboard.press(`Alt+${index + 1}`)
    await expect(block).toHaveAttribute('data-kind', kind)
    await expect(page.getByRole('combobox', { name: 'Screenplay element', exact: true })).toHaveValue(kind)
  }
})

test('character completion works and closes when focus leaves the editor', async ({ page }) => {
  await page.locator('.screenplay-editor p').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await expect(page.locator('.screenplay-editor p').last()).toHaveAttribute('data-kind', 'scene')
  await page.getByRole('combobox', { name: 'Screenplay element', exact: true }).selectOption('character')
  await page.keyboard.type('LE')
  await expect(page.getByRole('option', { name: 'LENA', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator('.screenplay-editor p').last()).toHaveText('LENA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('One more line.')
  await expect(page.locator('.screenplay-editor p').last()).toHaveAttribute('data-kind', 'dialogue')
  await page.keyboard.press('Enter')
  await page.getByRole('combobox', { name: 'Screenplay element', exact: true }).selectOption('character')
  await page.keyboard.type('SA')
  await expect(page.getByRole('listbox', { name: 'Character suggestions' })).toBeVisible()
  await page.locator('#scene-notes').click()
  await expect(page.getByRole('listbox', { name: 'Character suggestions' })).toHaveCount(0)
})

test('preferences and zoom are applied and survive reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Spellcheck', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Show scene numbers', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Show scene notes panel', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('spellcheck', 'false')
  await expect(page.locator('.show-scene-numbers')).toHaveCount(1)
  await expect(page.getByRole('complementary', { name: 'Scene notes', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Page zoom', exact: true }).selectOption('0.75')
  expect(await page.locator('.paper-stack').evaluate((element) => getComputedStyle(element).transform)).toBe(
    'matrix(0.75, 0, 0, 0.75, 0, 0)',
  )
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('spellcheck', 'false')
  await expect(page.getByRole('combobox', { name: 'Page zoom', exact: true })).toHaveValue('0.75')
  await expect(page.locator('.show-scene-numbers')).toHaveCount(1)
})

test('filters and navigates scenes and characters', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Filter scenes', exact: true }).fill('station')
  await expect(page.locator('.scene-row')).toHaveCount(1)
  await page.locator('.scene-row').click()
  await expect(page.locator('.inspector h3')).toHaveText('INT. CENTRAL STATION')
  await page.getByRole('textbox', { name: 'Filter scenes', exact: true }).fill('')
  await page.getByRole('tab', { name: 'Characters', exact: true }).click()
  await page.getByRole('textbox', { name: 'Filter characters', exact: true }).fill('samir')
  await expect(page.locator('.character-row')).toHaveCount(1)
  await page.locator('.character-row').click()
  await expect(page.getByRole('combobox', { name: 'Screenplay element', exact: true })).toHaveValue(
    'character',
  )
  await page.getByRole('textbox', { name: 'Filter characters', exact: true }).fill('no-such-character')
  await expect(page.locator('.character-row')).toHaveCount(0)
})

test('adds a scene from both navigation and outline', async ({ page }) => {
  await page.getByRole('button', { name: 'Add scene', exact: true }).click()
  await expect(page.locator('.scene-row')).toHaveCount(7)
  await expect(page.locator('.screenplay-editor p').last()).toHaveText('INT. ')
  await page.keyboard.type('NEW LOCATION - NIGHT')
  await page.getByRole('tab', { name: 'Outline', exact: true }).click()
  await page.locator('.outline-heading').getByRole('button', { name: 'Add scene', exact: true }).click()
  await expect(page.locator('.scene-row')).toHaveCount(8)
  await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('search count follows edits without moving the writing cursor', async ({ page }) => {
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('city')
  const matches = await page.locator('.search-match').count()
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' A city, then a city.')
  await expect(page.locator('.match-count')).toHaveText(`${matches + 2} matches`)
  await expect(page.locator('.screenplay-editor p').nth(1)).toHaveText(
    'The city holds its breath. A city, then a city.',
  )
})

test('toolbar dismissal clears search highlights', async ({ page }) => {
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('city')
  await expect(page.locator('.search-match').first()).toBeVisible()
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await expect(page.locator('.find-bar')).toHaveCount(0)
  await expect(page.locator('.search-match')).toHaveCount(0)
})

test('page indicator follows the caret across a dialogue continuation', async ({ page }) => {
  const dialogue = page.locator('.screenplay-editor p').filter({ hasText: 'But everything around it does.' })
  await dialogue.evaluate((element) => {
    const text = element.lastChild!
    const selection = document.getSelection()!
    selection.collapse(text, text.textContent!.length)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await expect(page.locator('.status-bar')).toContainText('Page 3 of 3')
})

test('pasted HTML with invalid middle-block metadata cannot crash the editor', async ({ page }) => {
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.locator('.screenplay-editor').evaluate((element) => {
    const clipboard = new DataTransfer()
    clipboard.setData(
      'text/html',
      '<p>Paste start.</p><p data-kind="unsupported">Safe middle paragraph.</p><p>Paste end.</p>',
    )
    clipboard.setData('text/plain', 'Paste start.\n\nSafe middle paragraph.\n\nPaste end.')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.locator('.screenplay-editor')).toContainText('Safe middle paragraph.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.screenplay-editor')).toContainText('Safe middle paragraph.')
})

test('blank document titles receive a visible validation error', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('title')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('document details persist across project creation and switching', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A Different Morning')
  await page.getByRole('textbox', { name: 'Written by', exact: true }).fill('Morgan Lee')
  await page.getByRole('textbox', { name: 'Draft', exact: true }).fill('Second draft')
  await page
    .getByRole('textbox', { name: 'Logline', exact: true })
    .fill('Two siblings follow a recording across the city.')
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(page.getByRole('button', { name: 'A Different Morning', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New screenplay', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Next Project')
  await page.getByRole('button', { name: 'Create screenplay', exact: true }).click()
  await expect(page.locator('.screenplay-editor p')).toHaveCount(1)
  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await expect(page.locator('.project-list-item')).toHaveCount(2)
  await page.locator('.project-list-item').filter({ hasText: 'A Different Morning' }).click()
  await expect(page.locator('.screenplay-editor p')).toHaveCount(58)
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Written by', exact: true })).toHaveValue('Morgan Lee')
  await expect(page.getByRole('textbox', { name: 'Draft', exact: true })).toHaveValue('Second draft')
  await expect(page.getByRole('textbox', { name: 'Logline', exact: true })).toHaveValue(
    'Two siblings follow a recording across the city.',
  )
})

test('previous, next, and single-match replacement leave other matches intact', async ({ page }) => {
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('city')
  const before = await page.locator('.search-match').count()
  await page.getByRole('button', { name: 'Next match', exact: true }).click()
  await page.getByRole('button', { name: 'Previous match', exact: true }).click()
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('village')
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect(page.locator('.search-match')).toHaveCount(before - 1)
  await expect(page.locator('.screenplay-editor')).toContainText('village')
})

for (const format of ['fountain', 'scripy'] as const) {
  test(`exports ${format} from the dialog as a parseable document`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-14T12:34:56.789Z'))
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('radio', { name: format === 'scripy' ? 'Scripy' : 'Fountain', exact: true }).click()
    const expectedName =
      format === 'scripy' ? 'The Quiet Hours_2026-09-14_12-34-56-789Z.scripy' : 'The Quiet Hours.fountain'
    await expect(page.locator('.export-filename')).toHaveText(expectedName)
    await page.clock.setFixedTime(new Date('2026-09-14T12:35:00.001Z'))
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export document', exact: true }).click()
    const download = await pending
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const content = Buffer.concat(chunks).toString('utf8')
    expect(download.suggestedFilename()).toBe(expectedName)
    if (format === 'scripy') {
      const project = JSON.parse(content)
      expect(project.blocks).toHaveLength(58)
      expect(project.notes[project.blocks[0].id]).toContain('Let the city be a character.')
    } else {
      const script = new Fountain().parse(content, true)
      expect(script.tokens.filter((token) => token.type === 'scene_heading')).toHaveLength(6)
      expect(script.tokens.some((token) => token.text === 'The city holds its breath.')).toBe(true)
    }
  })
}

test('PDF title-page and scene-number options affect the exported file', async ({ page }) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Include title page', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Scene numbers', exact: true }).check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true })
  const pdf = await loading.promise
  expect(pdf.numPages).toBe(3)
  const content = await (await pdf.getPage(1)).getTextContent()
  const numbers = content.items.filter((item) => 'str' in item && item.str === '1')
  expect(numbers).toHaveLength(2)
  await loading.destroy()
})

test('long titles and the notes drawer fit a narrow mobile viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('A Very Long Screenplay Title With Several More Words')
  await page.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 740 })
  const titleBounds = await page.locator('.document-menu-button').boundingBox()
  const exportBounds = await page.locator('.export-button').boundingBox()
  expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(exportBounds!.x - 4)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.locator('.sidebar.mobile-open')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Show scene notes', exact: true }).click()
  await page.getByRole('button', { name: 'Close scene notes', exact: true }).click()
  await expect(page.locator('.sidebar-backdrop')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/studio-mobile-320.png' })
})
