import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import files from './files.cjs'

let directory
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-files-'))
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

function document(title = 'Draft') {
  return JSON.stringify({
    version: 1,
    id: 'test-document',
    title,
    blocks: [{ kind: 'action', text: 'A quiet morning.' }],
  })
}

describe('native file durability', () => {
  it('atomically saves the new draft and keeps a previous-version backup', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'draft.scripy')
    await store.save(document('First'), destination)
    await store.save(document('Second'))
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Second')
    expect(JSON.parse(await fs.readFile(`${destination}.bak`, 'utf8')).title).toBe('First')
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('preserves save ordering under rapid successive requests', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'draft.scripy')
    await store.save(document(), destination)
    await Promise.all([
      store.save(document('One')),
      store.save(document('Two')),
      store.save(document('Three')),
    ])
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Three')
  })

  it('refuses to overwrite an external edit', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'draft.scripy')
    await store.save(document(), destination)
    await fs.writeFile(destination, document('Changed by another program'))
    await expect(store.save(document('Our later draft'))).rejects.toThrow('changed on disk')
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Changed by another program')
  })

  it('binds opened files only after the renderer validates and accepts the document', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'draft.scripy')
    await fs.writeFile(destination, document())
    const opened = await store.open(destination)
    expect(await store.has(document())).toBe(false)
    await expect(store.bind(opened.token, 'wrong-document')).rejects.toThrow('does not match')
    await store.bind(opened.token, 'test-document')
    expect(await store.has(document())).toBe(true)
    await expect(store.bind(opened.token, 'test-document')).rejects.toThrow('does not match')
  })

  it('does not bind an imported Fountain source for destructive autosaving', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'draft.fountain')
    await fs.writeFile(destination, 'INT. ROOM - DAY\n\nMorning light.\n')
    expect((await store.open(destination)).token).toBeNull()
    expect(await store.save(document())).toBeNull()
  })

  it('rejects oversized or unsupported files', async () => {
    const destination = path.join(directory, 'large.scripy')
    await fs.writeFile(destination, Buffer.alloc(5 * 1024 * 1024 + 1))
    await expect(files.readDocument(destination)).rejects.toThrow('5 MB')
    await expect(files.readDocument(path.join(directory, 'app.exe'))).rejects.toThrow('Select a')
  })

  it('retains the exact native file location across application restarts', async () => {
    const sessionPath = path.join(directory, 'profile', 'file-locations.json')
    const destination = path.join(directory, 'My screenplay.scripy')
    const first = new files.DocumentFiles({ sessionPath })
    await first.save(document('Before restart'), destination)
    const restarted = new files.DocumentFiles({ sessionPath })
    expect(await restarted.location()).toEqual({
      id: 'test-document',
      path: destination,
      name: 'My screenplay.scripy',
    })
    expect(await restarted.has(document())).toBe(true)
    await restarted.save(document('After restart'))
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('After restart')
  })

  it('persists accepted opens, but never remembers a canceled or rejected import', async () => {
    const sessionPath = path.join(directory, 'profile', 'file-locations.json')
    const destination = path.join(directory, 'Opened.scripy')
    await fs.writeFile(destination, document())
    const first = new files.DocumentFiles({ sessionPath })
    const opened = await first.open(destination)
    expect(opened.path).toBe(destination)
    expect(await new files.DocumentFiles({ sessionPath }).location()).toBeNull()
    await first.bind(opened.token, 'test-document')
    expect((await new files.DocumentFiles({ sessionPath }).location()).path).toBe(destination)
  })

  it('still protects externally changed files after restart', async () => {
    const sessionPath = path.join(directory, 'file-locations.json')
    const destination = path.join(directory, 'draft.scripy')
    await new files.DocumentFiles({ sessionPath }).save(document(), destination)
    await fs.writeFile(destination, document('External changes while closed'))
    const restarted = new files.DocumentFiles({ sessionPath })
    await expect(restarted.save(document('Stale recovery draft'))).rejects.toThrow('changed on disk')
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('External changes while closed')
  })

  it('loads actual disk content when reopening a known location', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'reopened.scripy')
    await store.save(document('Original'), destination)
    await fs.writeFile(destination, document('Edited outside Scripy'))
    const reopened = await store.reopen('test-document')
    expect(reopened.changedOnDisk).toBe(true)
    expect(JSON.parse(reopened.content).title).toBe('Edited outside Scripy')
    await store.bind(reopened.token, 'test-document')
    await store.save(document('Continued editing'))
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Continued editing')
  })

  it('detects external edits even when size and modification time match', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'same-size.scripy')
    await store.save(document('Draft A'), destination)
    const original = await fs.stat(destination)
    await fs.writeFile(destination, document('Draft B'))
    await fs.utimes(destination, original.atime, original.mtime)
    await expect(store.save(document('Draft C'))).rejects.toThrow('changed on disk')
  })

  it('does not replace the previous-version backup on a no-change save', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'backup.scripy')
    await store.save(document('First'), destination)
    await store.save(document('Second'))
    await store.save(document('Second'))
    expect(JSON.parse(await fs.readFile(`${destination}.bak`, 'utf8')).title).toBe('First')
  })

  it('rejects a file that changes between reading and accepting an open', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'changing.scripy')
    await fs.writeFile(destination, document('Before'))
    const opened = await store.open(destination)
    await fs.writeFile(destination, document('After'))
    await expect(store.bind(opened.token, 'test-document')).rejects.toThrow('changed while it was opening')
    expect(await store.has(document())).toBe(false)
  })

  it('can open a valid screenplay after the saved-location metadata is corrupted', async () => {
    const sessionPath = path.join(directory, 'file-locations.json')
    const destination = path.join(directory, 'valid.scripy')
    await fs.writeFile(sessionPath, '{invalid metadata')
    await fs.writeFile(destination, document())
    const store = new files.DocumentFiles({ sessionPath })
    await expect(store.reopen('test-document')).rejects.toThrow('file locations could not be restored')
    const opened = await store.open(destination)
    await store.bind(opened.token, 'test-document')
    expect((await store.location('test-document')).path).toBe(destination)
    expect(await fs.readFile(`${sessionPath}.bak`, 'utf8')).toBe('{invalid metadata')
  })

  it('accepts UTF-8 byte order marks in native files', async () => {
    const store = new files.DocumentFiles()
    const destination = path.join(directory, 'windows-file.scripy')
    await fs.writeFile(destination, `\uFEFF${document()}`)
    const opened = await store.open(destination)
    await store.bind(opened.token, 'test-document')
    expect((await store.location('test-document')).path).toBe(destination)
  })
})
