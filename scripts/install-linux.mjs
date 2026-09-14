import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const packageInfo = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const executable = path.join(root, packageInfo.build.directories.output, 'linux-unpacked', 'scripy')
const applicationId = 'studio.scripy.app.desktop'
const mimeType = 'application/x-scripy-screenplay'
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')

if (process.platform !== 'linux')
  throw new Error('This registration command is for Linux. Use a platform installer on Windows or macOS.')
if (process.argv.includes('--check')) {
  const association = await execute('xdg-mime', ['query', 'default', mimeType])
  if (association.stdout.trim() !== applicationId)
    throw new Error('Scripy is not the default application for .scripy files.')
  await fs.access(executable, constants.X_OK)
  console.log(`File association verified: ${mimeType} -> ${applicationId}\nExecutable: ${executable}`)
} else {
  await fs.access(executable, constants.X_OK).catch(() => {
    throw new Error('Build the desktop app first with npm run desktop:pack.')
  })
  const applications = path.join(dataHome, 'applications')
  const icons = path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps')
  await fs.mkdir(applications, { recursive: true })
  await fs.mkdir(icons, { recursive: true })
  const quotedExecutable = `"${executable.replace(/([\\"`$])/g, '\\$1').replace(/%/g, '%%')}"`
  const launcher = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Scripy',
    'GenericName=Screenplay Editor',
    'Comment=Write and edit screenplays',
    `Exec=${quotedExecutable} %f`,
    'Terminal=false',
    'Icon=studio.scripy.app',
    'Categories=Office;WordProcessor;',
    `MimeType=${mimeType};`,
    'StartupWMClass=Scripy',
    '',
  ].join('\n')
  await fs.writeFile(path.join(applications, applicationId), launcher, { mode: 0o644 })
  await fs.copyFile(path.join(root, 'public', 'icon.png'), path.join(icons, 'studio.scripy.app.png'))
  await execute('xdg-mime', ['install', '--mode', 'user', path.join(root, 'scripts', 'studio-scripy.xml')])
  try {
    await execute('update-desktop-database', [applications])
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await execute('xdg-mime', ['default', applicationId, mimeType])
  const association = await execute('xdg-mime', ['query', 'default', mimeType])
  if (association.stdout.trim() !== applicationId)
    throw new Error('The desktop did not accept the requested .scripy file association.')
  console.log(
    `Scripy registered for .scripy files in your user account.\nExecutable: ${executable}\nKeep the release folder at this location, or rerun this command after moving it.`,
  )
}
