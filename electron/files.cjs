const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { constants } = require('node:fs')
const lockfile = require('proper-lockfile')

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

function documentId(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_DOCUMENT_BYTES)
    throw new Error('The document exceeds the 5 MB limit.')
  const value = JSON.parse(content.replace(/^\uFEFF/, ''))
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![1, 2, 3].includes(value.version) ||
    typeof value.id !== 'string' ||
    !/^[\w-]{1,100}$/.test(value.id) ||
    !Array.isArray(value.blocks) ||
    !value.blocks.length
  )
    throw new Error('Invalid Scripy document.')
  return value.id
}

function contentFingerprint(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function fingerprint(filePath) {
  return (await readDocument(filePath)).fingerprint
}

async function readDocument(filePath) {
  if (!['.scripy', '.fountain', '.txt', '.json'].includes(path.extname(filePath).toLowerCase()))
    throw new Error('Select a .scripy or .fountain document.')
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES)
      throw new Error('The selected document exceeds the 5 MB limit or is not a regular file.')
    const bytes = await handle.readFile()
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('The selected document exceeds the 5 MB limit.')
    let content
    try {
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new Error('The screenplay is not valid UTF-8 text. Convert its encoding before opening it.')
    }
    return { content, name: path.basename(filePath), fingerprint: contentFingerprint(bytes) }
  } finally {
    await handle.close()
  }
}

async function atomicWrite(filePath, content, backup = false, beforeReplace) {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
  )
  let handle
  try {
    handle = await fs.open(temporary, 'wx', 0o600)
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    handle = undefined
    await beforeReplace?.()
    if (backup) {
      try {
        await atomicWrite(`${filePath}.bak`, await fs.readFile(filePath))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    await beforeReplace?.()
    await fs.rename(temporary, filePath)
  } finally {
    await handle?.close()
    await fs.rm(temporary, { force: true })
  }
}

class DocumentFiles {
  records = new Map()
  pending = new Map()
  queue = Promise.resolve()
  ready = null
  activeId = null
  sessionWarning = null
  sessionDirty = false

  constructor({ sessionPath = null } = {}) {
    this.sessionPath = sessionPath
  }

  initialize() {
    this.ready ??= this.restoreSession().catch(() => {
      this.records.clear()
      this.activeId = null
      this.sessionWarning =
        'Saved file locations could not be restored. Open your .scripy file from its location; your local recovery draft is still available.'
    })
    return this.ready
  }

  async restoreSession() {
    if (!this.sessionPath) return
    let content
    try {
      content = await fs.readFile(this.sessionPath, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    const session = JSON.parse(content)
    if (session.version !== 1 || !Array.isArray(session.files))
      throw new Error('The saved file locations could not be read. Open your screenplay from disk.')
    for (const record of session.files) {
      if (
        !record ||
        typeof record.id !== 'string' ||
        !/^[\w-]{1,100}$/.test(record.id) ||
        typeof record.path !== 'string' ||
        !path.isAbsolute(record.path) ||
        typeof record.fingerprint !== 'string'
      )
        throw new Error('The saved file locations contain an invalid entry.')
      this.records.set(record.id, record)
    }
    this.activeId = this.records.has(session.activeId) ? session.activeId : null
  }

  async persistSession() {
    if (!this.sessionPath) {
      this.sessionDirty = false
      return
    }
    await fs.mkdir(path.dirname(this.sessionPath), { recursive: true })
    await atomicWrite(
      this.sessionPath,
      JSON.stringify({ version: 1, activeId: this.activeId, files: [...this.records.values()] }),
      true,
    )
    this.sessionWarning = null
    this.sessionDirty = false
  }

  async location(id = this.activeId) {
    await this.initialize()
    const record = this.records.get(id ?? this.activeId)
    return record ? { id: record.id, path: record.path, name: path.basename(record.path) } : null
  }

  async open(filePath) {
    await this.initialize()
    await this.queue.catch(() => undefined)
    filePath = await fs.realpath(path.resolve(filePath))
    const result = await readDocument(filePath)
    let token = null
    if (['.scripy', '.json'].includes(path.extname(filePath).toLowerCase())) {
      const id = documentId(result.content)
      token = crypto.randomUUID()
      this.pending.clear()
      this.pending.set(token, {
        id,
        path: filePath,
        fingerprint: result.fingerprint,
      })
    }
    return { ...result, path: filePath, token }
  }

  async reopen(id) {
    await this.initialize()
    if (this.sessionWarning) throw new Error(this.sessionWarning)
    const record = this.records.get(id)
    if (!record) return null
    const result = await this.open(record.path)
    return { ...result, changedOnDisk: result.fingerprint !== record.fingerprint }
  }

  bind(token, id) {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        await this.initialize()
        const record = this.pending.get(token)
        if (!record || record.id !== id)
          throw new Error('The opened document does not match the imported screenplay.')
        if ((await fingerprint(record.path)) !== record.fingerprint)
          throw new Error(
            'This file changed while it was opening. Open the file again to load the latest version.',
          )
        const previousRecords = new Map(this.records)
        const previousActive = this.activeId
        const previousDirty = this.sessionDirty
        for (const [existingId, existing] of this.records) {
          if (existing.path === record.path && existingId !== id) this.records.delete(existingId)
        }
        this.records.set(id, record)
        this.activeId = id
        this.sessionDirty = true
        try {
          await this.persistSession()
        } catch (error) {
          this.records = previousRecords
          this.activeId = previousActive
          this.sessionDirty = previousDirty
          throw error
        }
        this.pending.delete(token)
        return this.location(id)
      })
    this.queue = operation
    return operation
  }

  async has(content) {
    await this.initialize()
    return this.records.has(documentId(content))
  }

  save(content, selectedPath) {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        await this.initialize()
        const id = documentId(content)
        const record = this.records.get(id)
        let target = selectedPath ? path.resolve(selectedPath) : record?.path
        if (!target) return null
        if (selectedPath) {
          try {
            target = await fs.realpath(target)
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        target = path.join(await fs.realpath(path.dirname(target)), path.basename(target))
        let compromised
        let release
        try {
          release = await lockfile.lock(target, {
            realpath: false,
            stale: 30000,
            update: 5000,
            retries: 0,
            onCompromised: (error) => {
              compromised = error
            },
          })
        } catch (error) {
          if (error.code === 'ELOCKED')
            throw new Error(
              'This screenplay is being saved by another instance. Your draft is safe in local recovery; retry saving shortly.',
            )
          throw error
        }
        try {
          const nextFingerprint = contentFingerprint(content)
          const assertUnchanged = async () => {
            let currentFingerprint
            try {
              currentFingerprint = await fingerprint(target)
            } catch {
              throw new Error(
                'The screenplay file was moved or deleted. Export a new Scripy copy before closing.',
              )
            }
            if (currentFingerprint !== record.fingerprint)
              throw new Error(
                'This screenplay changed on disk. Your draft is safe in local recovery; export a Scripy copy to avoid overwriting external changes.',
              )
            return currentFingerprint
          }
          const beforeReplace = async () => {
            if (compromised)
              throw new Error('Exclusive file access was lost. Keep a new Scripy copy before closing.')
            if (!selectedPath && record) await assertUnchanged()
          }
          if (!selectedPath && record) {
            const currentFingerprint = await assertUnchanged()
            if (nextFingerprint === currentFingerprint) {
              if (this.sessionDirty) await this.persistSession()
              return target
            }
          }
          await atomicWrite(target, content, true, beforeReplace)
          this.records.set(id, {
            id,
            path: target,
            fingerprint: nextFingerprint,
          })
          this.activeId = id
          this.sessionDirty = true
          await this.persistSession()
          return target
        } finally {
          await release()
        }
      })
    this.queue = operation
    return operation
  }
}

module.exports = { DocumentFiles, atomicWrite, readDocument, documentId }
