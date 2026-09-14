import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const artifact =
  process.argv[2] ||
  path.join(
    root,
    metadata.build.directories.output,
    `Scripy-${metadata.version}-linux-${process.arch}.tar.gz`,
  )
if (process.platform !== 'linux')
  throw new Error(
    'This portable archive test currently targets Linux. Run native release tests on each receiving operating system.',
  )
await fs.access(artifact)
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'Scripy transferred application '))

async function findExecutable(directory, depth = 0) {
  const candidate = path.join(directory, 'scripy')
  try {
    await fs.access(candidate, constants.X_OK)
    return candidate
  } catch {
    if (depth >= 2) return null
  }
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue
    const found = await findExecutable(path.join(directory, item.name), depth + 1)
    if (found) return found
  }
  return null
}

try {
  const extracted = path.join(temporary, 'Application files')
  const unrelated = path.join(temporary, 'Unrelated working directory')
  await fs.mkdir(extracted)
  await fs.mkdir(unrelated)
  await execute('tar', ['-xzf', artifact, '-C', extracted])
  const executable = await findExecutable(extracted)
  if (!executable) throw new Error('The release archive does not contain an executable Scripy application.')
  const result = await execute(process.execPath, [path.join(root, 'scripts', 'smoke-desktop.mjs')], {
    cwd: unrelated,
    env: {
      ...process.env,
      SCRIPY_TEST_EXECUTABLE: executable,
      SCRIPY_TEST_OFFLINE: '1',
      SCRIPY_DEV_URL: 'http://127.0.0.1:9',
    },
    maxBuffer: 1024 * 1024,
  })
  process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  console.log(
    `Portable archive verified: ${path.basename(artifact)}\nExtracted to an unrelated path with spaces; packaged startup ignored a stale dev-server URL and passed offline fullscreen, save/reopen, and A4/image PDF export.`,
  )
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
