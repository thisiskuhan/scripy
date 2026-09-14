import { _electron as electron, chromium, expect } from '@playwright/test'
import electronExecutable from 'electron'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { preview } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-multi-instance-'))
const executable = process.env.SCRIPY_TEST_EXECUTABLE || electronExecutable
const baseArgs = process.env.SCRIPY_TEST_EXECUTABLE ? [] : [path.join(root, 'scripts/desktop-fixture.cjs')]
const profile = path.join(temporary, 'primary-profile')
const firstPath = path.join(temporary, 'First.scripy')
const sameIdentityPath = path.join(temporary, 'Same identity backup.scripy')
const secondPath = path.join(temporary, 'Second.scripy')
const invalidPath = path.join(temporary, 'Invalid.scripy')
const rescuePath = path.join(temporary, 'Recovered competing copy.scripy')
const applications = []
const rendererErrors = []
const results = []
const execute = promisify(execFile)
let browser
let server

function environment(profilePath) {
  return {
    ...process.env,
    SCRIPY_TEST_DATA: profilePath,
    SCRIPY_DEV_URL: undefined,
    ELECTRON_RUN_AS_NODE: undefined,
  }
}

async function launch(profilePath, filePath) {
  const application = await electron.launch({
    executablePath: executable,
    args: [...baseArgs, ...(filePath ? [filePath] : [])],
    env: environment(profilePath),
    timeout: 25000,
  })
  applications.push(application)
  const page = await application.firstWindow()
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  if (!filePath) {
    const home = page.getByRole('main', { name: 'Scripy home', exact: true })
    await expect(home).toBeVisible({ timeout: 20000 })
    await home.locator('.home-recent-item[data-current="true"]').click()
  }
  await expect(page.locator('.screenplay-editor')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.screenplay-editor')).toHaveAttribute('contenteditable', 'true')
  return { application, page }
}

async function relaunch(filePath) {
  await execute(executable, [...baseArgs, ...(filePath ? [filePath] : [])], {
    env: environment(profile),
    timeout: 20000,
    maxBuffer: 1024 * 1024,
  })
}

async function append(page, text) {
  const paragraph = page.locator('.screenplay-editor p').nth(1)
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  await expect(paragraph).toContainText(text.trim())
}

async function save(page) {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('.status-saved')).toBeVisible()
}

function record(message) {
  results.push(message)
  console.log(`PASS: ${message}`)
}

try {
  const fixture = JSON.parse(
    await fs.readFile(path.join(root, 'e2e/fixtures/native-screenplay.json'), 'utf8'),
  )
  await fs.writeFile(firstPath, JSON.stringify({ ...fixture, id: 'multi-first', title: 'First Script' }))
  await fs.writeFile(secondPath, JSON.stringify({ ...fixture, id: 'multi-second', title: 'Second Script' }))
  await fs.writeFile(invalidPath, JSON.stringify({ id: 'invalid', version: 3, blocks: [] }))
  const primary = await launch(profile, firstPath)
  const primaryPid = primary.application.process().pid
  await expect(primary.page.locator('.file-location')).toHaveText(firstPath)
  await save(primary.page)

  await relaunch()
  assert.equal(primary.application.process().pid, primaryPid)
  assert.equal(primary.application.windows().length, 1)
  await expect(primary.page.locator('.file-location')).toHaveText(firstPath)
  record('Relaunching the same desktop profile reuses its existing process and window')

  if (process.env.SCRIPY_TEST_EXISTING_WEB_SERVER !== '1') {
    server = await preview({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      preview: { host: '127.0.0.1', port: 7457, strictPort: true, open: false },
    })
  }
  browser = await chromium.launch()
  const web = await browser.newPage()
  await web.goto('http://127.0.0.1:7457/')
  await expect(web.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  assert.equal(await web.evaluate(() => typeof window.scripyDesktop), 'undefined')
  const diskBeforeBrowserEdits = await fs.readFile(firstPath, 'utf8')
  await web.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name: 'Browser copy.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(diskBeforeBrowserEdits),
  })
  await expect(web.locator('.screenplay-editor')).toBeVisible()
  await expect(web.getByRole('status')).toContainText('Imported Browser copy.scripy')
  const downloads = []
  web.on('download', (download) => downloads.push(download.suggestedFilename()))
  await append(web, ' BROWSER COPY ONLY')
  await save(web)
  assert.equal(await fs.readFile(firstPath, 'utf8'), diskBeforeBrowserEdits)
  await append(primary.page, ' DESKTOP COPY ONLY')
  await save(primary.page)
  assert.doesNotMatch(await fs.readFile(firstPath, 'utf8'), /BROWSER COPY ONLY/)
  await expect(web.locator('.screenplay-editor')).not.toContainText('DESKTOP COPY ONLY')
  await expect(primary.page.locator('.screenplay-editor')).not.toContainText('BROWSER COPY ONLY')
  assert.deepEqual(downloads, [])
  record('Browser and desktop can edit independent same-ID copies without overwriting each other')

  await primary.page.evaluate(() => {
    const schedule = window.setTimeout
    window.setTimeout = (handler, delay, ...args) => schedule(handler, delay === 450 ? 60000 : delay, ...args)
    window.addEventListener(
      'restore-autosave-timer',
      () => {
        window.setTimeout = schedule
      },
      { once: true },
    )
  })
  await append(primary.page, ' Pending on same-file relaunch.')
  await relaunch(firstPath)
  await expect(primary.page.locator('.screenplay-editor')).toContainText('Pending on same-file relaunch.')
  await save(primary.page)
  assert.match(await fs.readFile(firstPath, 'utf8'), /Pending on same-file relaunch\./)
  await primary.page.evaluate(() => window.dispatchEvent(new Event('restore-autosave-timer')))
  record('Reopening the same file before autosave preserves the current pending edit')

  await fs.copyFile(firstPath, sameIdentityPath)
  await append(primary.page, ' Pending before opening a same-ID copy.')
  await relaunch(sameIdentityPath)
  await expect(primary.page.locator('.file-location')).toHaveText(sameIdentityPath)
  assert.match(await fs.readFile(firstPath, 'utf8'), /Pending before opening a same-ID copy\./)
  await relaunch(firstPath)
  await expect(primary.page.locator('.file-location')).toHaveText(firstPath)
  await expect(primary.page.locator('.screenplay-editor')).toContainText(
    'Pending before opening a same-ID copy.',
  )
  record('Opening a different path with the same document ID flushes the outgoing file')

  await append(primary.page, ' Pending edit before second launch.')
  await primary.page.getByRole('button', { name: 'Edit document details', exact: true }).click()
  const details = primary.page.getByRole('dialog')
  await details.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsubmitted dialog title')
  await relaunch(secondPath)
  await expect(details).toBeVisible()
  await expect(details.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Unsubmitted dialog title',
  )
  await expect(primary.page.locator('.file-location')).toHaveText(firstPath)
  await details.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(primary.page.locator('.file-location')).toHaveText(secondPath)
  assert.match(await fs.readFile(firstPath, 'utf8'), /Pending edit before second launch\./)
  assert.equal(primary.application.process().pid, primaryPid)
  assert.equal(primary.application.windows().length, 1)
  await save(primary.page)
  record('A second-process file-open request waits for dialogs and preserves pending edits')

  const secondBeforeInvalid = await fs.readFile(secondPath, 'utf8')
  await relaunch(invalidPath)
  await expect(primary.page.getByRole('alert')).toContainText('Invalid Scripy document')
  await expect(primary.page.locator('.file-location')).toHaveText(secondPath)
  assert.equal(await fs.readFile(secondPath, 'utf8'), secondBeforeInvalid)
  await primary.page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  record('An invalid file forwarded by another process leaves the current document and disk unchanged')

  const competing = await launch(path.join(temporary, 'competing-profile'), secondPath)
  await expect(competing.page.locator('.file-location')).toHaveText(secondPath)
  await primary.application.evaluate(async (_electron, destination) => {
    const nativeFs = process.getBuiltinModule('fs/promises')
    const rename = nativeFs.rename
    nativeFs.rename = async (source, target) => {
      if (target === destination) {
        nativeFs.rename = rename
        await new Promise((resolve) => {
          globalThis.scripyResumeReplacement = resolve
        })
      }
      return rename(source, target)
    }
  }, secondPath)
  await append(primary.page, ' PRIMARY PROFILE WINS')
  await primary.page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => primary.application.evaluate(() => typeof globalThis.scripyResumeReplacement))
    .toBe('function')
  const beforeReplacement = await fs.readFile(secondPath, 'utf8')
  await append(competing.page, ' STALE PROFILE RECOVERY')
  await competing.page.keyboard.press('ControlOrMeta+s')
  await expect(competing.page.getByRole('alert')).toContainText('another instance')
  assert.equal(await fs.readFile(secondPath, 'utf8'), beforeReplacement)
  await primary.application.evaluate(() => globalThis.scripyResumeReplacement())
  await expect(primary.page.locator('.status-saved')).toBeVisible()
  const protectedContent = await fs.readFile(secondPath, 'utf8')
  await competing.page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(competing.page.locator('.status-error')).toBeVisible()
  await expect(competing.page.getByRole('alert')).toContainText('changed on disk')
  assert.equal(await fs.readFile(secondPath, 'utf8'), protectedContent)
  const staleRecovery = await competing.page.evaluate(() => localStorage.getItem('scripy.emergency.v1'))
  assert.match(staleRecovery, /STALE PROFILE RECOVERY/)
  await competing.application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
  }, rescuePath)
  await competing.page.getByRole('button', { name: 'Document menu', exact: true }).click()
  await competing.page.getByRole('menuitem', { name: 'Save as...', exact: true }).click()
  await expect(competing.page.locator('.file-location')).toHaveText(rescuePath)
  await expect(competing.page.locator('.status-saved')).toBeVisible()
  assert.match(await fs.readFile(rescuePath, 'utf8'), /STALE PROFILE RECOVERY/)
  assert.equal(await fs.readFile(secondPath, 'utf8'), protectedContent)
  record('Overlapping separate-profile saves are locked; stale retries cannot replace the newer file')

  await competing.application.close()
  applications.splice(applications.indexOf(competing.application), 1)
  await primary.application.close()
  applications.splice(applications.indexOf(primary.application), 1)
  const restarted = await launch(profile)
  await expect(restarted.page.locator('.file-location')).toHaveText(secondPath)
  await expect(restarted.page.locator('.screenplay-editor')).toContainText('PRIMARY PROFILE WINS')
  await expect(restarted.page.locator('.screenplay-editor')).not.toContainText('STALE PROFILE RECOVERY')
  await expect(web.locator('.screenplay-editor')).toContainText('BROWSER COPY ONLY')
  record('Restart restores the correct desktop file while the browser copy remains independent')
  assert.deepEqual(rendererErrors, [])
  console.log(`Native multi-instance verification: ${results.length} scenarios passed.`)
} finally {
  for (const application of applications.reverse()) {
    await application.evaluate(() => globalThis.scripyResumeReplacement?.()).catch(() => undefined)
    await application.close().catch(() => undefined)
  }
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await fs.rm(temporary, { recursive: true, force: true })
}
