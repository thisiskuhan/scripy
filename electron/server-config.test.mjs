import { describe, expect, it } from 'vitest'
import { createServer, resolveConfig } from 'vite'
import { createServer as createTcpServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

describe('fixed local server address', () => {
  it('uses port 7457 without silent port fallback for development and preview', async () => {
    const config = await resolveConfig({ root }, 'serve')
    expect(config.server).toMatchObject({ host: '127.0.0.1', port: 7457, strictPort: true })
    expect(config.preview).toMatchObject({ host: '127.0.0.1', port: 7457, strictPort: true })
  })

  it('fails on an occupied 7457 instead of listening on another port', async () => {
    const blocker = createTcpServer()
    const owned = await new Promise((resolve, reject) => {
      blocker.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)))
      blocker.listen(7457, '127.0.0.1', () => resolve(true))
    })
    let server
    try {
      server = await createServer({ root, logLevel: 'silent', server: { watch: null } })
      await expect(server.listen()).rejects.toThrow('Port 7457 is already in use')
    } finally {
      await server?.close()
      if (owned) await new Promise((resolve) => blocker.close(resolve))
    }
  })
})
