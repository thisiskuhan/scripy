import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-ui-qa-'))
const output = process.env.SCRIPY_QA_OUTPUT || path.join(root, 'test-results/desktop-ui')
const measurements = {}
const errors = []
const externalRequests = []
let application
let page
await fs.mkdir(output, { recursive: true })

async function controlsFit() {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const issues = []
        for (const element of document.querySelectorAll(
          '.app-header button, .view-bar button, .editor-toolbar button, .editor-toolbar select',
        )) {
          const bounds = element.getBoundingClientRect()
          if (!bounds.width || !bounds.height) continue
          if (bounds.left < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight)
            issues.push(`${element.getAttribute('aria-label')} outside window`)
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
          if (!hit || !element.contains(hit)) issues.push(`${element.getAttribute('aria-label')} obstructed`)
        }
        return issues
      }),
    )
    .toEqual([])
}

try {
  const started = performance.now()
  application = await electron.launch({
    executablePath: process.env.SCRIPY_TEST_EXECUTABLE,
    args: process.env.SCRIPY_TEST_EXECUTABLE ? [] : [path.join(root, 'scripts/desktop-fixture.cjs')],
    env: {
      ...process.env,
      SCRIPY_TEST_DATA: temporary,
      SCRIPY_DEV_URL: process.env.SCRIPY_TEST_EXECUTABLE ? 'http://127.0.0.1:9' : undefined,
      ELECTRON_RUN_AS_NODE: undefined,
    },
    timeout: 25000,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url())
  })
  const home = page.getByRole('main', { name: 'Scripy home', exact: true })
  await expect(home).toBeVisible({ timeout: 20000 })
  await expect(home.getByRole('button', { name: 'New screenplay', exact: true })).toBeEnabled()
  measurements.homeReadyMs = Math.round(performance.now() - started)
  assert.equal(new URL(page.url()).protocol, 'scripy:')
  await page.context().setOffline(true)
  await expect(home.getByRole('button', { name: 'Download desktop app' })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Choose Save as once')
  await page.getByRole('button', { name: "Don't show this again", exact: true }).click()
  await page.keyboard.press('Alt+t')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Alt+t')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.screenshot({ path: path.join(output, 'home.png') })

  const security = await application.evaluate(({ BrowserWindow, app }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return {
      packaged: app.isPackaged,
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      webSecurity: preferences.webSecurity,
    }
  })
  assert.equal(security.sandbox, true)
  assert.equal(security.contextIsolation, true)
  assert.equal(security.nodeIntegration, false)
  assert.notEqual(security.webSecurity, false)
  if (process.env.SCRIPY_TEST_EXECUTABLE) assert.equal(security.packaged, true)
  measurements.security = security
  const bridge = await page.evaluate(async () => {
    const headers = (await fetch(location.href)).headers
    let invalidExportRejected = false
    try {
      await window.scripyDesktop.exportFile(new Uint8Array([1]), 'unsafe', 'exe')
    } catch {
      invalidExportRejected = true
    }
    const popup = window.open('https://example.invalid', '_blank')
    return {
      node: typeof require,
      process: typeof process,
      csp: headers.get('content-security-policy'),
      invalidExportRejected,
      popupBlocked: popup === null,
    }
  })
  assert.equal(bridge.node, 'undefined')
  assert.equal(bridge.process, 'undefined')
  assert.equal(bridge.invalidExportRejected, true)
  assert.equal(bridge.popupBlocked, true)
  assert.match(bridge.csp, /script-src 'self'/)
  assert.match(bridge.csp, /connect-src 'self'/)
  assert.equal(application.windows().length, 1)
  measurements.bridge = bridge

  await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name: 'qa.scripy',
    mimeType: 'application/json',
    buffer: await fs.readFile(path.join(root, 'e2e/fixtures/native-screenplay.json')),
  })
  const editor = page.locator('.screenplay-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(page.getByRole('status')).toContainText('Imported qa.scripy')
  const block = editor.locator('p').nth(1)
  await block.click()
  await expect(editor).toBeFocused()
  const original = await block.innerText()
  const kinds = ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot']
  for (const [index, kind] of kinds.entries()) {
    await page.keyboard.press(`Alt+${index + 1}`)
    await expect(block).toHaveAttribute('data-kind', kind)
  }
  await page.keyboard.press('Alt+2')
  await page.keyboard.press('Tab')
  await expect(block).toHaveAttribute('data-kind', 'character')
  await page.keyboard.press('Shift+Tab')
  await expect(block).toHaveAttribute('data-kind', 'action')
  await page.keyboard.press('End')
  await page.keyboard.type(' Native keyboard check.')
  await page.keyboard.press('Control+z')
  await expect(block).toHaveText(original)
  await page.keyboard.press('Control+Shift+z')
  await expect(block).toContainText('Native keyboard check.')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
  await expect(block).toContainText('Native keyboard check.')
  await page.keyboard.press('Alt+f')
  await expect(page.locator('.app')).toHaveClass(/focus-mode/)
  await page.keyboard.press('Alt+f')
  await expect(page.locator('.app')).not.toHaveClass(/focus-mode/)
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('sleeping')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled()
  await editor.focus()
  await page.keyboard.press('Control+Alt+m')
  const noteDialog = page.getByRole('dialog', { name: 'New passage note' })
  await expect(noteDialog).toBeVisible()
  await noteDialog.getByRole('textbox', { name: 'Note text', exact: true }).fill('Native note shortcut.')
  await noteDialog.getByRole('textbox', { name: 'Note text', exact: true }).press('Control+s')
  await expect(noteDialog).toHaveCount(0)
  await expect(page.locator('.passage-highlight')).toHaveText('sleeping')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Editor preferences', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Spellcheck', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Show scene numbers', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveAttribute('spellcheck', 'false')
  for (const zoom of ['0.75', '1', '1.25', 'fit']) {
    await page.getByRole('combobox', { name: 'Page zoom', exact: true }).selectOption(zoom)
    await expect(page.getByRole('combobox', { name: 'Page zoom', exact: true })).toHaveValue(zoom)
  }

  const savedPath = path.join(temporary, 'Keyboard QA.scripy')
  await application.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
  }, savedPath)
  await page.keyboard.press('Control+Shift+s')
  await expect(page.locator('.file-location')).toHaveText(savedPath)
  await expect(page.getByRole('status')).toHaveText('Screenplay saved to disk.')
  await block.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Immediate save check.')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toHaveText('Changes saved.')
  const saved = JSON.parse(await fs.readFile(savedPath, 'utf8'))
  assert.match(saved.blocks[1].text, /Native keyboard check/)
  assert.match(saved.blocks[1].text, /Immediate save check\./)
  assert.equal(saved.annotations[0].text, 'Native note shortcut.')
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click()

  const stableText = await editor.innerText()
  const session = await page.context().newCDPSession(page)
  await session.send('HeapProfiler.collectGarbage')
  measurements.domBeforeRepeatUse = await session.send('Memory.getDOMCounters')
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const opener = page.getByRole('button', { name: 'Editor preferences', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Editor preferences', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(opener).toBeFocused()
    for (const tab of ['Outline', 'Notes', 'Script'])
      await page.getByRole('tab', { name: tab, exact: true }).click()
    assert.equal(await editor.innerText(), stableText)
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.ok((await page.locator('.floating-notifications').count()) <= 1)
  await session.send('HeapProfiler.collectGarbage')
  measurements.domAfterRepeatUse = await session.send('Memory.getDOMCounters')

  for (const [width, height] of [
    [780, 600],
    [1024, 768],
    [1366, 900],
  ]) {
    await application.evaluate(
      ({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setSize(...size)
      },
      [width, height],
    )
    await controlsFit()
    for (const theme of ['dark', 'light']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.keyboard.press('Alt+t')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.screenshot({ path: path.join(output, `editor-${width}-${theme}.png`) })
    }
  }

  const feature = {
    ...saved,
    id: 'native-performance-fixture',
    title: 'Native Feature Length',
    annotations: [],
    notes: {},
    blocks: Array.from({ length: 1200 }, (_, index) => ({
      id: `native-block-${index}`,
      kind: index % 6 === 0 ? 'scene' : 'action',
      text:
        index % 6 === 0
          ? `INT. STATION ${index} - DAY`
          : 'The station is quiet. A distant announcement echoes through the empty hall.',
    })),
  }
  const importStarted = performance.now()
  await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
    name: 'feature.scripy',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(feature)),
  })
  await expect(editor.locator('p')).toHaveCount(1200)
  measurements.featureImportMs = Math.round(performance.now() - importStarted)
  const featureBlock = editor.locator('p').nth(1)
  await featureBlock.click()
  await page.keyboard.press('End')
  const typingStarted = performance.now()
  await page.keyboard.type(' Still listening.')
  await expect(featureBlock).toContainText('Still listening.')
  measurements.typing17KeysMs = Math.round(performance.now() - typingStarted)
  assert.ok(measurements.typing17KeysMs < 2500)
  measurements.pages = await page.locator('.paper-sheet').count()
  await expect(page.locator('.status-saved')).toBeVisible()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('END OF NATIVE QA')
  await expect(editor.locator('p').last()).toHaveText('END OF NATIVE QA')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Home')
  await expect(page.getByRole('combobox', { name: 'Screenplay element' })).toHaveValue('scene')
  measurements.processes = await application.evaluate(({ app }) =>
    app.getAppMetrics().map((item) => ({
      type: item.type,
      cpuPercent: item.cpu.percentCPUUsage,
      workingSetKB: item.memory.workingSetSize,
    })),
  )
  await page.screenshot({ path: path.join(output, 'feature-length.png') })
  assert.deepEqual(errors, [])
  assert.deepEqual(externalRequests, [])
  await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2))
  console.log('Desktop UI walkthrough passed:', JSON.stringify(measurements, null, 2))
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  console.error('Renderer errors:', errors)
  throw error
} finally {
  if (application) await application.close().catch(() => undefined)
  await fs.rm(temporary, { recursive: true, force: true })
}
