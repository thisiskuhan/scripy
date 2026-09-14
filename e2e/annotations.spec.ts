import { expect, test, type Download, type Page } from './fixtures'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

async function downloadedProject(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function addNote(
  page: Page,
  quote = 'sleeping',
  text = 'Keep the street quiet.',
  departments = ['Sound', 'Music'],
  tags = ['general', 'camera'],
) {
  await page.getByRole('tab', { name: 'Script', exact: true }).click()
  await selectPassage(page, quote)
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await dialog.getByRole('textbox', { name: 'Note text', exact: true }).fill(text)
  for (const department of departments)
    await dialog.getByRole('checkbox', { name: department, exact: true }).check()
  for (const tag of tags) await dialog.getByRole('checkbox', { name: tag, exact: true }).check()
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

async function selectPassage(page: Page, phrase: string) {
  await page.evaluate((selected) => {
    const editor = document.querySelector<HTMLElement>('.screenplay-editor')!
    const paragraph = [...editor.querySelectorAll('p')].find((node) => node.textContent?.includes(selected))!
    editor.focus()
    const start = paragraph.textContent!.indexOf(selected)
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    let offset = 0
    let began = false
    while (walker.nextNode()) {
      const node = walker.currentNode
      const length = node.textContent!.length
      if (!began && start < offset + length) {
        range.setStart(node, start - offset)
        began = true
      }
      if (began && start + selected.length <= offset + length) {
        range.setEnd(node, start + selected.length - offset)
        break
      }
      offset += length
    }
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  }, phrase)
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => document.fonts.ready)
})

test('keyboard note creation validates empty text, saves pending tags, and leaves cancelled edits unchanged', async ({
  page,
}) => {
  await selectPassage(page, 'sleeping')
  await page.keyboard.press('Control+Alt+m')
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Note text', exact: true }).fill('   ')
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a note before saving.')
  await dialog.getByRole('textbox', { name: 'Note text', exact: true }).fill('Keep the first take.')
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('  First Take ')
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Passage notes', exact: true })
  await expect(panel).toContainText('#first take')
  await panel.getByRole('button', { name: 'Edit note', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit passage note' })
  await edit.getByRole('textbox', { name: 'Note text', exact: true }).fill('Discard this edit.')
  await edit.getByRole('checkbox', { name: 'Music', exact: true }).check()
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(panel).toContainText('Keep the first take.')
  await expect(panel).not.toContainText('Discard this edit.')
  await expect(panel.locator('.note-department-list')).toHaveCount(0)
})

test('overlapping notes remain independent and removed notes leave no stale text marks', async ({ page }) => {
  await addNote(page)
  await addNote(page, 'sleeping streets', 'Keep the camera still.', ['Cinematography'], ['camera'])
  const row = page
    .getByRole('region', { name: 'Passage notes', exact: true })
    .locator('.passage-note-row')
    .filter({ hasText: 'Keep the street quiet.' })
  const id = await row.getAttribute('data-note')
  await row.getByRole('button', { name: 'Delete note', exact: true }).click()
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.locator(`[data-note-id="${id}"]`)).toHaveCount(0)
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping streets')
  await page.locator('.passage-highlight').click()
  await expect(
    page.getByRole('region', { name: 'Passage notes', exact: true }).locator('.is-active'),
  ).toContainText('Keep the camera still.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping streets')
})

test('multi-paragraph notes retain anchors through splits, scene reordering, and undo', async ({ page }) => {
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.screenplay-editor')!
    const paragraphs = editor.querySelectorAll('p')
    editor.focus()
    const range = document.createRange()
    range.setStart(paragraphs[2].firstChild!, paragraphs[2].textContent!.indexOf('sleeping'))
    range.setEnd(paragraphs[3].firstChild!, 'On a rooftop, a small red light'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(dialog.locator('.note-quote-preview')).toHaveText(
    'sleeping streets.\nOn a rooftop, a small red light',
  )
  await dialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Bridge the two moments with sound.')
  await dialog.getByRole('checkbox', { name: 'Sound', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveCount(2)
  await selectPassage(page, 'sleeping')
  await page.keyboard.press('ArrowLeft')
  for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(page.locator('.passage-highlight')).toHaveCount(3)
  expect((await page.locator('.passage-highlight').allTextContents()).join('')).toBe(
    'sleeping streets.On a rooftop, a small red light',
  )
  await page.getByRole('tab', { name: 'Outline', exact: true }).click()
  await page.getByRole('button', { name: 'Move scene 1 later', exact: true }).click()
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const row = page.getByRole('region', { name: 'Screenplay notes', exact: true }).locator('.passage-note-row')
  await expect(row).toContainText('Scene 2 / EXT. CITY ROOFTOPS')
  await page.getByRole('tab', { name: 'Script', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveCount(2)
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.passage-highlight')).toHaveCount(2)
})

test('detached notes can be reattached and pasted HTML cannot duplicate note anchors', async ({ page }) => {
  await addNote(page)
  await selectPassage(page, 'sleeping')
  await page.keyboard.press('Backspace')
  await selectPassage(page, 'silver line')
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const view = page.getByRole('region', { name: 'Screenplay notes', exact: true })
  await view.getByRole('button', { name: 'Edit note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit passage note' })
  await dialog.getByRole('button', { name: 'Attach selected text', exact: true }).click()
  await expect(dialog.locator('.note-quote-preview')).toHaveText('silver line')
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await view.getByRole('button', { name: 'Go to passage', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveText('silver line')
  const id = await page
    .getByRole('region', { name: 'Passage notes', exact: true })
    .locator('.passage-note-row')
    .getAttribute('data-note')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.evaluate((noteId) => {
    const data = new DataTransfer()
    data.setData('text/html', `<p><span data-note-id="${noteId}">silver line</span></p>`)
    document
      .querySelector('.screenplay-editor')!
      .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, id)
  await expect(page.locator('.screenplay-editor p').last()).toHaveText('silver line')
  await expect(page.locator('.passage-highlight')).toHaveCount(1)
})

test('passage highlights preserve pagination and never appear in screenplay PDF output', async ({ page }) => {
  const paragraphHeights = () =>
    page
      .locator('.screenplay-editor p')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.getBoundingClientRect().height,
          (element as HTMLElement).offsetTop,
        ]),
      )
  const before = await paragraphHeights()
  await addNote(page, 'sleeping', 'PRIVATE PRODUCTION NOTE - AMBIENT CUE')
  expect(await paragraphHeights()).toEqual(before)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const loading = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true })
  try {
    const pdf = await loading.promise
    expect(pdf.numPages).toBe(4)
    const text: string[] = []
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const pdfPage = await pdf.getPage(index)
      const content = await pdfPage.getTextContent()
      text.push(...content.items.flatMap((item) => ('str' in item ? [item.str] : [])))
      expect(await pdfPage.getAnnotations()).toHaveLength(0)
    }
    expect(text.join(' ')).toContain('sleeping streets.')
    expect(text.join(' ')).not.toContain('PRIVATE PRODUCTION NOTE')
  } finally {
    await loading.destroy()
  }
})

test('failed deletion checkpoints preserve the note and allow retry', async ({ page }) => {
  await addNote(page)
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const row = page.getByRole('region', { name: 'Screenplay notes', exact: true }).locator('.passage-note-row')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'snapshots') throw new DOMException('Snapshot quota exceeded', 'QuotaExceededError')
      return put.apply(this, args)
    }
    window.addEventListener(
      'restore-note-storage',
      () => {
        IDBObjectStore.prototype.put = put
      },
      { once: true },
    )
  })
  await row.getByRole('button', { name: 'Delete note', exact: true }).click()
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Snapshot quota exceeded')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Keep the street quiet.')
  await page.evaluate(() => window.dispatchEvent(new Event('restore-note-storage')))
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row).toHaveCount(0)
})

test('a second tab can inspect notes but cannot create, edit, resolve, or delete them', async ({
  page,
  context,
}) => {
  await addNote(page)
  await expect(page.locator('.status-saved')).toBeVisible()
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.locator('.screenplay-editor')).toBeVisible()
  await expect(second.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'false')
  await second.getByRole('tab', { name: 'Notes', exact: true }).click()
  const view = second.getByRole('region', { name: 'Screenplay notes', exact: true })
  await expect(view.locator('.passage-note-row')).toHaveCount(1)
  for (const name of ['Add note', 'Edit note', 'Resolve note', 'Delete note'])
    await expect(view.getByRole('button', { name, exact: true })).toBeDisabled()
  await second.close()
})

for (const viewport of [
  { width: 1366, height: 900, theme: 'light' },
  { width: 320, height: 740, theme: 'dark' },
]) {
  test(`note composition and filters fit ${viewport.width}px in ${viewport.theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    if (viewport.theme === 'dark')
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    await addNote(page, 'sleeping', 'Fade the street ambience into a low musical pulse.', [
      'Sound',
      'Music',
      'Cinematography',
    ])
    await page.getByRole('tab', { name: 'Notes', exact: true }).click()
    const view = page.getByRole('region', { name: 'Screenplay notes', exact: true })
    await view.getByRole('button', { name: 'Edit note', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit passage note' })
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.locator('.note-form-body').evaluate((element) => {
      element.scrollTop = 0
    })
    expect(
      await dialog
        .locator('.note-quote-preview')
        .evaluate((element) => element.scrollHeight <= element.clientHeight),
    ).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Attach selected text', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save note', exact: true })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/passage-note-form-${viewport.width}.png` })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await view.locator('summary', { hasText: 'Tags' }).click()
    await view.getByRole('checkbox', { name: 'camera', exact: true }).check()
    const menu = view
      .locator('.note-filter-options')
      .filter({ has: page.getByRole('checkbox', { name: 'camera', exact: true }) })
    const bounds = await menu.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    await view.locator('summary', { hasText: 'Tags' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(view.locator('.passage-note-row')).toHaveCount(1)
    await page.screenshot({ path: `test-results/passage-notes-view-${viewport.width}.png` })
  })
}

test('Notes view combines filters and supports edit, resolve, jump, and confirmed deletion', async ({
  page,
}) => {
  await addNote(page)
  await addNote(page, 'Headphones', 'Match the headphone position.', ['Costume'], ['continuity'])
  await addNote(page, 'silver line', 'Hold this camera move.', ['Cinematography'], ['camera'])
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const view = page.getByRole('region', { name: 'Screenplay notes', exact: true })
  const rows = view.locator('.passage-note-row')
  await expect(rows).toHaveCount(3)
  const clearFilters = view.getByRole('button', { name: 'Clear note filters', exact: true })
  await expect(clearFilters).toBeDisabled()
  await view.locator('summary', { hasText: 'Departments' }).click()
  await view.getByRole('checkbox', { name: 'Sound', exact: true }).check()
  await view.getByRole('checkbox', { name: 'Cinematography', exact: true }).check()
  await view.locator('summary', { hasText: 'Departments' }).click()
  await expect(rows).toHaveCount(2)
  await expect(clearFilters).toBeEnabled()
  await view.locator('summary', { hasText: 'Tags' }).click()
  await view.getByRole('checkbox', { name: 'camera', exact: true }).check()
  await view.getByRole('checkbox', { name: 'general', exact: true }).check()
  await view.locator('summary', { hasText: 'Tags' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Keep the street quiet.')
  await view.getByRole('textbox', { name: 'Search notes', exact: true }).fill('missing')
  await expect(view.getByText('No matching notes', { exact: true })).toBeVisible()
  await view.getByRole('textbox', { name: 'Search notes', exact: true }).fill('sleeping')
  await expect(rows).toHaveCount(1)
  await rows.getByRole('button', { name: 'Edit note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit passage note' })
  await expect(dialog.getByRole('checkbox', { name: 'Sound', exact: true })).toBeChecked()
  await dialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Let the distant train carry this moment.')
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(rows).toContainText('Let the distant train')
  await rows.getByRole('button', { name: 'Resolve note', exact: true }).click()
  await view.getByRole('combobox', { name: 'Note status', exact: true }).selectOption('open')
  await expect(rows).toHaveCount(0)
  await view.getByRole('combobox', { name: 'Note status', exact: true }).selectOption('resolved')
  await expect(rows).toHaveCount(1)
  await rows.getByRole('button', { name: 'Go to passage', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('sleeping')
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  await rows.getByRole('button', { name: 'Delete note', exact: true }).click()
  await rows.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await rows.getByRole('button', { name: 'Delete note', exact: true }).click()
  await rows.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(rows).toHaveCount(0)
  await view.getByRole('button', { name: 'Clear note filters', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(clearFilters).toBeDisabled()
  await expect(rows.filter({ hasText: 'Let the distant train' })).toHaveCount(0)
})

test('slash assigns departments and hash assigns or creates tags from the note field', async ({ page }) => {
  await page.getByRole('button', { name: 'Add passage note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  const field = dialog.getByRole('textbox', { name: 'Note text', exact: true })
  await field.click()
  await field.pressSequentially('/sound')
  const departmentMenu = dialog.getByRole('listbox', { name: 'Department suggestions' })
  await expect(departmentMenu.getByRole('option', { name: 'Sound', exact: true })).toBeVisible()
  await field.press('Enter')
  await expect(dialog.getByRole('checkbox', { name: 'Sound', exact: true })).toBeChecked()
  await expect(field).toHaveValue('')
  await field.pressSequentially('Aerial cue /AerialUnit')
  await expect(
    departmentMenu.getByRole('option', { name: 'Create department "AerialUnit"', exact: true }),
  ).toBeVisible()
  await field.press('Enter')
  await expect(dialog.getByRole('checkbox', { name: 'AerialUnit', exact: true })).toBeChecked()
  await expect(field).toHaveValue('Aerial cue ')
  await field.pressSequentially('#gen')
  const tagMenu = dialog.getByRole('listbox', { name: 'Tag suggestions' })
  await expect(tagMenu.getByRole('option', { name: '#general', exact: true })).toBeVisible()
  await field.press('Enter')
  await expect(dialog.getByRole('checkbox', { name: 'general', exact: true })).toBeChecked()
  await field.pressSequentially('#nighttone')
  await expect(tagMenu.getByRole('option', { name: 'Create tag "#nighttone"', exact: true })).toBeVisible()
  await field.press('Enter')
  await expect(dialog.locator('.note-tag').filter({ hasText: 'nighttone' })).toBeVisible()
  await field.pressSequentially('Fade the aerial pass.')
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const row = page.getByRole('region', { name: 'Screenplay notes', exact: true }).locator('.passage-note-row')
  await expect(row).toContainText('Sound')
  await expect(row).toContainText('AerialUnit')
  await expect(row).toContainText('#general')
  await expect(row).toContainText('#nighttone')
})

test('anchors follow insertions, survive text deletion as detached notes, and return on undo', async ({
  page,
}) => {
  await addNote(page)
  await selectPassage(page, 'sleeping')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('still ')
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(page.locator('.status-saved')).toBeVisible()
  await selectPassage(page, 'sleeping')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.passage-highlight')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  const view = page.getByRole('region', { name: 'Screenplay notes', exact: true })
  await view.getByRole('combobox', { name: 'Note status', exact: true }).selectOption('detached')
  await expect(view.locator('.passage-note-row')).toHaveCount(1)
  await expect(view.locator('.passage-note-row')).toContainText('sleeping')
  await expect(view.getByRole('button', { name: 'Go to passage', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: 'Script', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(page.getByRole('region', { name: 'Passage notes', exact: true })).toContainText(
    'Keep the street quiet.',
  )
})

test('notes round-trip in downloaded files and recover with snapshots', async ({ page }) => {
  await addNote(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Download copy', exact: true }).click()
  const project = await downloadedProject(await pending)
  expect(project.version).toBe(3)
  expect(project.annotations).toHaveLength(1)
  expect(project.annotations[0]).toMatchObject({
    quote: 'sleeping',
    departments: ['Sound', 'Music'],
    tags: ['general', 'camera'],
  })
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await page.getByRole('button', { name: 'Snapshot', exact: true }).click()
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page
    .getByRole('region', { name: 'Passage notes', exact: true })
    .getByRole('button', { name: 'Edit note', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Note text', exact: true }).fill('Changed production direction.')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const snapshot = page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })
  await snapshot.getByRole('button', { name: 'Restore', exact: true }).click()
  await snapshot.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(page.getByRole('region', { name: 'Passage notes', exact: true })).toContainText(
    'Keep the street quiet.',
  )
  await page.locator('input[type="file"]').setInputFiles({
    name: 'annotated.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.getByRole('status')).toContainText('Imported annotated.scripy')
  await page.reload()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(page.getByRole('region', { name: 'Passage notes', exact: true })).toContainText(
    'Keep the street quiet.',
  )
})

test('selected words retain multi-department notes and tags through save and reload', async ({ page }) => {
  await selectPassage(page, 'sleeping')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(dialog.locator('.note-quote-preview')).toHaveText('sleeping')
  await dialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Fade the street ambience into a low musical pulse.')
  for (const department of ['Sound', 'Music', 'Cinematography'])
    await dialog.getByRole('checkbox', { name: department, exact: true }).check()
  for (const tag of ['general', 'camera'])
    await dialog.getByRole('checkbox', { name: tag, exact: true }).check()
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('quiet moment')
  await dialog.getByRole('button', { name: 'Add tag', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  const sidebarNote = page
    .getByRole('region', { name: 'Passage notes', exact: true })
    .locator('.passage-note-row')
  await expect(sidebarNote).toContainText('Sound')
  await expect(sidebarNote).toContainText('Music')
  await expect(sidebarNote).toContainText('#quiet moment')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await expect(sidebarNote).toContainText('Fade the street ambience')
  await expect(sidebarNote).toContainText('Cinematography')
})
