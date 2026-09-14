import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
})

test('sidebar memo text carries into department notes and Ctrl+S saves the note without a file download', async ({
  page,
}) => {
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('Most dark.')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
  const memo = page.locator('#scene-notes')
  await memo.fill('Record the quiet room tone separately.')
  await memo.press('Control+s')
  await expect(page.getByRole('status')).toHaveText('Scene memo saved.')
  await page.getByRole('button', { name: 'Departments & tags', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(dialog.getByRole('textbox', { name: 'Note text', exact: true })).toHaveValue(
    'Record the quiet room tone separately.',
  )
  await expect(dialog.locator('.note-quote-preview')).toHaveText('Most dark.')
  await dialog.getByRole('checkbox', { name: 'Sound', exact: true }).check()
  await dialog.getByRole('checkbox', { name: 'Music', exact: true }).check()
  await dialog.getByRole('checkbox', { name: 'general', exact: true }).check()
  await dialog.getByRole('textbox', { name: 'Note text', exact: true }).press('Control+s')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Note saved.')
  expect(downloads).toEqual([])
  await page.reload()
  const notes = page.getByRole('region', { name: 'Passage notes', exact: true })
  await expect(notes.locator('.passage-note-row')).toHaveCount(1)
  await expect(notes).toContainText('Record the quiet room tone separately.')
  await expect(notes).toContainText('Sound')
  await expect(notes).toContainText('Music')
  await expect(notes).toContainText('#general')
  await expect(page.locator('#scene-notes')).toHaveValue('Record the quiet room tone separately.')
})

test('visible Add note works for the current scene when no passage is selected', async ({ page }) => {
  await page.getByRole('button', { name: 'Add passage note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(dialog.locator('.note-quote-preview')).toContainText('EXT. CITY ROOFTOPS')
  await dialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Soft light across the opening scene.')
  await dialog.getByRole('checkbox', { name: 'Cinematography', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Passage notes', exact: true })).toContainText(
    'Cinematography',
  )
})

test('failed note saving keeps the form text and retry does not duplicate the note', async ({ page }) => {
  await page.getByRole('button', { name: 'Add passage note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New passage note' })
  await dialog
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Do not lose this production note.')
  await dialog.getByRole('checkbox', { name: 'Sound', exact: true }).check()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'snapshots')
        throw new DOMException('Note checkpoint unavailable', 'QuotaExceededError')
      return put.apply(this, args)
    }
    window.addEventListener(
      'restore-note-save',
      () => {
        IDBObjectStore.prototype.put = put
      },
      { once: true },
    )
  })
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Note checkpoint unavailable')
  await expect(dialog.getByRole('textbox', { name: 'Note text', exact: true })).toHaveValue(
    'Do not lose this production note.',
  )
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-note-save')))
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Passage notes', exact: true }).locator('.passage-note-row'),
  ).toHaveCount(1)
})

test('scene-note undo and redo affect the note, never the screenplay', async ({ page }) => {
  const script = await page.locator('.screenplay-editor').innerText()
  const note = page.locator('#scene-notes')
  const original = await note.inputValue()
  await note.click()
  await note.press('Control+End')
  await page.keyboard.type(' A note edit to undo.')
  const edited = `${original} A note edit to undo.`
  await expect(note).toHaveValue(edited)
  await expect(page.locator('.status-saved')).toBeVisible()
  await note.press('Control+z')
  await expect(note).not.toHaveValue(edited)
  await note.press('Control+Shift+z')
  await expect(note).toHaveValue(edited)
  await page.getByRole('button', { name: 'Undo memo', exact: true }).click()
  await expect(note).not.toHaveValue(edited)
  await page.getByRole('button', { name: 'Redo memo', exact: true }).click()
  await expect(note).toHaveValue(edited)
  expect(await page.locator('.screenplay-editor').innerText()).toBe(script)
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.reload()
  await expect(page.locator('#scene-notes')).toHaveValue(edited)
})

test('passage-note text supports undo and redo while its form is open', async ({ page }) => {
  const script = await page.locator('.screenplay-editor').innerText()
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('sleeping')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const note = page.getByRole('textbox', { name: 'Note text', exact: true })
  await note.click()
  await page.keyboard.type('Let the sound fade.')
  await expect(note).toHaveValue('Let the sound fade.')
  await note.press('Control+z')
  await expect(note).not.toHaveValue('Let the sound fade.')
  await note.press('Control+y')
  await expect(note).toHaveValue('Let the sound fade.')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await page.locator('.screenplay-editor').innerText()).toBe(script)
})
