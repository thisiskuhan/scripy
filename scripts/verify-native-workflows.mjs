import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-native-workflows-'))
const profile = path.join(temporary, 'profile')
const firstPath = path.join(temporary, 'First screenplay.scripy')
const secondPath = path.join(temporary, 'Second screenplay.SCRIPY')
const copyPath = path.join(temporary, 'Recovered copy.SCRIPY')
const invalidPath = path.join(temporary, 'Malformed screenplay.scripy')
const recoveryPath = path.join(temporary, 'Restored file.scripy')
const rescuePath = path.join(temporary, 'Storage failure rescue.scripy')
const errors = []
let application
const execute = promisify(execFile)

async function requestOpen(filePath) {
  if (process.env.SCRIPY_TEST_MIME === '1') {
    const type = await execute('xdg-mime', ['query', 'filetype', filePath])
    assert.equal(type.stdout.trim(), 'application/x-scripy-screenplay')
    await execute('xdg-open', [filePath], { env: { ...process.env, SCRIPY_TEST_DATA: profile } })
  } else {
    await application.evaluate(({ app }, requested) => {
      app.emit('second-instance', {}, ['scripy', requested], process.cwd())
    }, filePath)
  }
}

function document(id, title, text) {
  return {
    version: 1,
    id,
    title,
    author: 'Test Writer',
    draft: 'First draft',
    logline: '',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    blocks: [
      { id: `${id}-scene`, kind: 'scene', text: 'INT. STUDY - DAY' },
      { id: `${id}-action`, kind: 'action', text },
    ],
    notes: { [`${id}-scene`]: `Notes for ${title}.` },
  }
}

async function launch(filePath) {
  const args = process.env.SCRIPY_TEST_EXECUTABLE ? [] : [path.join(root, 'scripts/desktop-fixture.cjs')]
  if (process.env.SCRIPY_TEST_NO_SANDBOX === '1') args.push('--no-sandbox')
  if (filePath) args.push(filePath)
  application = await electron.launch({
    executablePath: process.env.SCRIPY_TEST_EXECUTABLE,
    args,
    env: { ...process.env, SCRIPY_TEST_DATA: profile, ELECTRON_RUN_AS_NODE: undefined },
    timeout: 25000,
  })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true', {
    timeout: 20000,
  })
  if (!filePath) {
    const home = page.getByRole('main', { name: 'Scripy home', exact: true })
    await expect(home).toBeVisible()
    await home.locator('.home-recent-item[data-current="true"]').click()
  }
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  return page
}

async function close() {
  await application.close()
  application = undefined
}
async function menu(page, name) {
  await page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}
async function setSaveDestination(destination) {
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => (filePath ? { canceled: false, filePath } : { canceled: true })
  }, destination)
}
async function setOpenDestination(destination) {
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, destination)
}
async function typeLine(page, text) {
  await page.locator('.screenplay-editor p').nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

try {
  await fs.writeFile(
    firstPath,
    JSON.stringify(document('first', 'First Script', 'Original disk content.'), null, 2),
  )
  await fs.writeFile(
    secondPath,
    JSON.stringify(document('second', 'Second Script', 'The second file.'), null, 2),
  )
  await fs.writeFile(invalidPath, JSON.stringify({ ...document('invalid', 'Invalid', ''), blocks: [] }))
  let page = await launch(firstPath)
  await expect(page.locator('.file-location')).toHaveText(firstPath)
  await expect(page.locator('.screenplay-editor')).toContainText('Original disk content.')
  await expect(page.locator('#scene-notes')).toHaveValue('Notes for First Script.')
  await application.evaluate(({ shell }) => {
    shell.showItemInFolder = (filePath) => {
      globalThis.scripyRevealedPath = filePath
    }
  })
  await page.locator('.file-location').click()
  assert.equal(await application.evaluate(() => globalThis.scripyRevealedPath), firstPath)
  await setSaveDestination(null)
  await menu(page, 'Save as...')
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.file-location')).toHaveText(firstPath)
  await typeLine(page, ' Saved to the original path.')
  await expect(page.locator('.status-saved')).toBeVisible()
  assert.match(await fs.readFile(firstPath, 'utf8'), /Saved to the original path\./)

  const external = document('first', 'First Script', 'External disk content must survive.')
  await fs.writeFile(firstPath, JSON.stringify(external, null, 2))
  await typeLine(page, ' My recoverable local changes.')
  await expect(page.locator('.status-error')).toBeVisible()
  assert.equal(JSON.parse(await fs.readFile(firstPath, 'utf8')).blocks[1].text, external.blocks[1].text)
  await setSaveDestination(copyPath)
  await menu(page, 'Save as...')
  await expect(page.locator('.file-location')).toHaveText(copyPath)
  await expect(page.locator('.status-saved')).toBeVisible()
  assert.match(await fs.readFile(copyPath, 'utf8'), /My recoverable local changes\./)
  assert.equal(JSON.parse(await fs.readFile(firstPath, 'utf8')).blocks[1].text, external.blocks[1].text)
  assert.equal((await fs.readdir(temporary)).includes('Recovered copy.SCRIPY.scripy'), false)

  await setOpenDestination(invalidPath)
  await menu(page, 'Import...')
  await expect(page.getByRole('alert')).toContainText('Invalid Scripy document')
  await expect(page.locator('.file-location')).toHaveText(copyPath)
  await expect(page.locator('.screenplay-editor')).toContainText('My recoverable local changes.')
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  await setOpenDestination(secondPath)
  await menu(page, 'Import...')
  await expect(page.locator('.file-location')).toHaveText(secondPath)
  await expect(page.locator('.screenplay-editor')).toContainText('The second file.')
  await requestOpen(firstPath)
  await expect(page.locator('.file-location')).toHaveText(firstPath)
  await expect(page.locator('.screenplay-editor')).toContainText('External disk content must survive.')
  await fs.writeFile(
    secondPath,
    JSON.stringify(document('second', 'Second Script', 'Updated outside the project library.'), null, 2),
  )
  await menu(page, 'My screenplays')
  await page.locator('.project-list-item').filter({ hasText: 'Second Script' }).click()
  await expect(page.locator('.file-location')).toHaveText(secondPath)
  await expect(page.locator('.screenplay-editor')).toContainText('Updated outside the project library.')
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await page.getByRole('button', { name: 'Snapshot', exact: true }).click()
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await typeLine(page, ' A change that will be restored.')
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  const snapshot = page.locator('.snapshot-row').filter({ hasText: 'Manual snapshot' })
  await snapshot.getByRole('button', { name: 'Restore', exact: true }).click()
  await snapshot.getByRole('button', { name: 'Confirm restore', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.status-saved')).toBeVisible()
  assert.doesNotMatch(await fs.readFile(secondPath, 'utf8'), /A change that will be restored/)
  await requestOpen(firstPath)
  await expect(page.locator('.file-location')).toHaveText(firstPath)
  await close()

  await fs.writeFile(
    firstPath,
    JSON.stringify(
      document('first', 'Changed While Closed', 'Fresh bytes read from the real file.'),
      null,
      2,
    ),
  )
  page = await launch()
  await expect(page.locator('.file-location')).toHaveText(firstPath)
  await expect(page.locator('.screenplay-editor')).toContainText('Fresh bytes read from the real file.')
  await expect(page.getByRole('button', { name: 'Changed While Closed', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Recovery history', exact: true }).click()
  await expect(
    page.locator('.snapshot-row').filter({ hasText: 'Before loading file from disk' }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await close()

  await fs.rename(firstPath, `${firstPath}.moved`)
  page = await launch()
  await expect(page.getByRole('alert')).toContainText('local recovery draft is shown')
  await expect(page.locator('.screenplay-editor')).toContainText('Fresh bytes read from the real file.')
  await setSaveDestination(recoveryPath)
  await menu(page, 'Save as...')
  await expect(page.locator('.file-location')).toHaveText(recoveryPath)
  await expect(page.locator('.status-saved')).toBeVisible()
  assert.match(await fs.readFile(recoveryPath, 'utf8'), /Fresh bytes read from the real file\./)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    const set = Storage.prototype.setItem
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Injected desktop storage quota', 'QuotaExceededError')
    }
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
  })
  await typeLine(page, ' Saved despite local storage failure.')
  await expect(page.locator('.status-error')).toBeVisible()
  assert.match(await fs.readFile(recoveryPath, 'utf8'), /Saved despite local storage failure\./)
  await setSaveDestination(rescuePath)
  await menu(page, 'Save as...')
  await expect(page.locator('.file-location')).toHaveText(rescuePath)
  await expect(page.getByRole('status')).toContainText('File saved. Local recovery still needs attention.')
  assert.match(await fs.readFile(rescuePath, 'utf8'), /Saved despite local storage failure\./)
  await application.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => {
      globalThis.scripyCloseWarning = true
      return { response: 0 }
    }
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect.poll(() => application.evaluate(() => globalThis.scripyCloseWarning)).toBe(true)
  await expect(page.locator('.screenplay-editor')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.locator('.status-saved')).toBeVisible()
  await close()
  assert.deepEqual(errors, [])
  console.log(
    'Native workflows passed: file launch, persistent paths, Save As, conflicts, restart, moved-file recovery, storage-quota rescue, and Keep open on failed close-time saving.',
  )
} finally {
  if (application) await application.close().catch(() => undefined)
  await fs.rm(temporary, { recursive: true, force: true })
}
