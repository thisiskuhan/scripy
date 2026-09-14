const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  net,
  screen,
  shell,
  nativeTheme,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const { DocumentFiles, atomicWrite } = require('./files.cjs')
const { OpenRequests } = require('./open-requests.cjs')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'scripy',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])
app.setName('Scripy')
if (process.env.SCRIPY_TEST_DATA) app.setPath('userData', process.env.SCRIPY_TEST_DATA)
const files = new DocumentFiles({ sessionPath: path.join(app.getPath('userData'), 'file-locations.json') })
const appearancePath = path.join(app.getPath('userData'), 'appearance.json')
let savedAppearance = 'system'
let appearanceQueue = Promise.resolve()
const openRequests = new OpenRequests()
openRequests.add(process.argv, process.cwd())
let mainWindow
let closeApproved = false
let closePending = false
let closeTimeout
const devUrl = app.isPackaged ? undefined : process.env.SCRIPY_DEV_URL
if (devUrl && !['127.0.0.1', 'localhost'].includes(new URL(devUrl).hostname))
  throw new Error('The development server must use a loopback address.')

function trusted(event) {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame)
    throw new Error('Untrusted document request.')
  const url = new URL(event.senderFrame.url)
  const permitted = devUrl
    ? url.origin === new URL(devUrl).origin
    : url.protocol === 'scripy:' && url.hostname === 'app'
  if (!permitted) throw new Error('Untrusted document origin.')
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...arguments_) => {
    trusted(event)
    return handler(...arguments_)
  })
}

function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? '#181c1a' : '#f0f2f3'
}

function setWindowFullscreen(fullscreen) {
  if (typeof fullscreen !== 'boolean') throw new Error('Invalid fullscreen state.')
  const window = mainWindow
  if (!window || window.isDestroyed()) throw new Error('The editor window is unavailable.')
  if (window.isFullScreen() === fullscreen) return Promise.resolve(fullscreen)
  return new Promise((resolve, reject) => {
    const event = fullscreen ? 'enter-full-screen' : 'leave-full-screen'
    const cleanup = () => {
      clearTimeout(timer)
      window.removeListener(event, changed)
      window.removeListener('closed', closed)
    }
    const changed = () => {
      cleanup()
      resolve(window.isFullScreen())
    }
    const closed = () => {
      cleanup()
      reject(new Error('The editor window closed.'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('The window manager did not change fullscreen mode.'))
    }, 8000)
    window.once(event, changed)
    window.once('closed', closed)
    try {
      window.setFullScreen(fullscreen)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(windowBackground())
})

function receiveOpenRequests(arguments_, workingDirectory) {
  openRequests.add(arguments_, workingDirectory)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('document:open-request')
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  receiveOpenRequests([filePath], process.cwd())
})

async function finishClose(saved) {
  clearTimeout(closeTimeout)
  if (!mainWindow || mainWindow.isDestroyed() || !closePending) return
  if (!saved) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Unsaved screenplay',
      message: 'Some changes could not be saved.',
      detail: 'Keep the window open to export a document copy, or close without saving the latest changes.',
      buttons: ['Keep open', 'Close without saving'],
      defaultId: 0,
      cancelId: 0,
    })
    if (result.response === 0) {
      closePending = false
      return
    }
  }
  closeApproved = true
  await appearanceQueue.catch(() => undefined)
  mainWindow.close()
}

function createWindow() {
  closeApproved = false
  closePending = false
  const workArea = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1440, workArea.width),
    height: Math.min(980, workArea.height),
    minWidth: 780,
    minHeight: 600,
    title: 'Scripy',
    icon: path.join(__dirname, '../dist/icon.png'),
    backgroundColor: windowBackground(),
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })
  Menu.setApplicationMenu(null)
  const reportFullscreen = () =>
    mainWindow?.webContents.send('window:fullscreen-changed', mainWindow.isFullScreen())
  mainWindow.on('enter-full-screen', reportFullscreen)
  mainWindow.on('leave-full-screen', reportFullscreen)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, target) => {
    const url = new URL(target)
    if (
      !(devUrl ? url.origin === new URL(devUrl).origin : url.protocol === 'scripy:' && url.hostname === 'app')
    )
      event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  mainWindow.webContents.session.setPermissionCheckHandler(() => false)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (closeApproved) return
    event.preventDefault()
    if (closePending) return
    closePending = true
    mainWindow.webContents.send('window:prepare-close')
    closeTimeout = setTimeout(() => {
      void finishClose(false)
    }, 5000)
  })
  mainWindow.on('closed', () => {
    clearTimeout(closeTimeout)
    mainWindow = null
  })
  void mainWindow.loadURL(devUrl || 'scripy://app/index.html')
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', (_event, arguments_, workingDirectory) =>
    receiveOpenRequests(arguments_, workingDirectory),
  )
  app.whenReady().then(async () => {
    try {
      const saved = JSON.parse(await fs.readFile(appearancePath, 'utf8'))
      if (['light', 'dark', 'system'].includes(saved.preference)) savedAppearance = saved.preference
    } catch {
      savedAppearance = 'system'
    }
    nativeTheme.themeSource = savedAppearance
    const root = path.resolve(__dirname, '../dist')
    protocol.handle('scripy', async (request) => {
      const url = new URL(request.url)
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 })
      const requested = path.resolve(root, `.${decodeURIComponent(url.pathname)}`)
      if (!requested.startsWith(`${root}${path.sep}`)) return new Response('Not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(requested).toString())
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'",
      )
      return response
    })
    handle('appearance:set', (preference) => {
      if (!['light', 'dark', 'system'].includes(preference)) throw new Error('Invalid appearance preference.')
      const operation = appearanceQueue
        .catch(() => undefined)
        .then(async () => {
          nativeTheme.themeSource = preference
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(windowBackground())
          if (savedAppearance !== preference) {
            await atomicWrite(appearancePath, JSON.stringify({ preference }))
            savedAppearance = preference
          }
          return true
        })
      appearanceQueue = operation
      return operation
    })
    handle('window:get-fullscreen', () => mainWindow.isFullScreen())
    handle('window:set-fullscreen', setWindowFullscreen)
    handle('document:open', async () => {
      const selected = await dialog.showOpenDialog(mainWindow, {
        title: 'Open screenplay',
        properties: ['openFile'],
        filters: [
          {
            name: 'Screenplay',
            extensions: ['scripy', 'fountain', 'txt', 'json'],
          },
        ],
      })
      return selected.canceled || !selected.filePaths[0] ? null : files.open(selected.filePaths[0])
    })
    handle('document:bind', (token, id) => {
      if (typeof token !== 'string' || typeof id !== 'string') throw new Error('Invalid file binding.')
      return files.bind(token, id)
    })
    handle('document:location', async (id) => {
      if (typeof id !== 'string') throw new Error('Invalid document identifier.')
      return files.location(id)
    })
    handle('document:reopen', async (id) => {
      if (typeof id !== 'string') throw new Error('Invalid document identifier.')
      return files.reopen(id)
    })
    handle('document:pending-open', async () => {
      const requested = openRequests.take()
      if (!requested) return null
      try {
        return { file: await files.open(requested), error: null }
      } catch (error) {
        return { file: null, error: `Could not open ${requested}: ${error.message}` }
      }
    })
    handle('document:reveal', async (id) => {
      if (typeof id !== 'string') throw new Error('Invalid document identifier.')
      const location = await files.location(id)
      if (!location) throw new Error('Save this screenplay to a file first.')
      shell.showItemInFolder(location.path)
      return true
    })
    handle('document:save', async (content, suggestedName, saveAs) => {
      if (typeof suggestedName !== 'string' || suggestedName.length > 200)
        throw new Error('Invalid filename.')
      let selectedPath
      if (saveAs || !(await files.has(content))) {
        const selected = await dialog.showSaveDialog(mainWindow, {
          title: 'Save screenplay',
          defaultPath: path.basename(suggestedName),
          filters: [{ name: 'Scripy screenplay', extensions: ['scripy'] }],
        })
        if (selected.canceled || !selected.filePath) return null
        selectedPath = selected.filePath.toLowerCase().endsWith('.scripy')
          ? selected.filePath
          : `${selected.filePath}.scripy`
      }
      const destination = await files.save(content, selectedPath)
      if (destination) app.addRecentDocument(destination)
      return destination ? { path: destination, saved: true } : null
    })
    handle('document:autosave', async (content) => Boolean(await files.save(content)))
    handle('document:export', async (bytes, suggestedName, extension) => {
      if (
        !['pdf', 'fountain', 'scripy'].includes(extension) ||
        typeof suggestedName !== 'string' ||
        suggestedName.length > 200 ||
        !(bytes instanceof Uint8Array) ||
        bytes.byteLength > 30 * 1024 * 1024
      )
        throw new Error('Invalid export request.')
      const selected = await dialog.showSaveDialog(mainWindow, {
        title: 'Export screenplay',
        defaultPath: path.basename(suggestedName),
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      })
      if (selected.canceled || !selected.filePath) return false
      const destination = selected.filePath.toLowerCase().endsWith(`.${extension}`)
        ? selected.filePath
        : `${selected.filePath}.${extension}`
      await atomicWrite(destination, Buffer.from(bytes))
      return true
    })
    ipcMain.on('window:close-ready', (event, saved) => {
      trusted(event)
      void finishClose(saved === true)
    })
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
