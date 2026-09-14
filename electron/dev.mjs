import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'

const server = await createServer()
await server.listen()
const url = server.resolvedUrls.local[0]
console.log(`Scripy desktop renderer: ${url}`)
const desktop = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, SCRIPY_DEV_URL: url },
})
desktop.on('exit', async (code) => {
  await server.close()
  process.exitCode = code ?? 0
})
desktop.on('error', async (error) => {
  console.error(error)
  await server.close()
  process.exitCode = 1
})
process.on('SIGINT', () => desktop.kill('SIGINT'))
process.on('SIGTERM', () => desktop.kill('SIGTERM'))
