import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import files from './files.cjs'

let directory
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scripy-failures-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

function content(title = 'Original draft') {
  return JSON.stringify({
    version: 2,
    id: 'fault-test-document',
    title,
    author: '',
    draft: 'First draft',
    logline: '',
    paperSize: 'letter',
    titleArtwork: null,
    notes: {},
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    blocks: [{ id: 'opening', kind: 'action', text: 'A protected first line.' }],
  })
}

function gate() {
  let resolve
  const promise = new Promise((complete) => {
    resolve = complete
  })
  return { promise, resolve: () => resolve() }
}

describe('native filesystem failure recovery', () => {
  it.each(['writeFile', 'sync', 'rename'])(
    'keeps the original and cleans temporary files on %s failure',
    async (operation) => {
      const destination = path.join(directory, 'protected.scripy')
      const store = new files.DocumentFiles()
      await store.save(content(), destination)
      const failure = Object.assign(new Error(`Injected ${operation} failure`), { code: 'ENOSPC' })
      if (operation === 'rename') {
        const rename = fs.rename
        vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
          if (target === destination) throw failure
          return rename(source, target)
        })
      } else {
        const open = fs.open
        vi.spyOn(fs, 'open').mockImplementation(async (...arguments_) => {
          const handle = await open(...arguments_)
          if (
            String(arguments_[0]).includes('.protected.scripy.') &&
            String(arguments_[0]).endsWith('.tmp')
          ) {
            vi.spyOn(handle, operation).mockRejectedValue(failure)
          }
          return handle
        })
      }
      await expect(store.save(content('Should not replace the original'))).rejects.toThrow(
        `Injected ${operation} failure`,
      )
      expect(await fs.readFile(destination, 'utf8')).toBe(content())
      expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
      vi.restoreAllMocks()
      await store.save(content('Successful retry'))
      expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Successful retry')
      expect(await fs.readFile(`${destination}.bak`, 'utf8')).toBe(content())
    },
  )

  it('does not replace a file if its backup cannot be written', async () => {
    const destination = path.join(directory, 'protected.scripy')
    const store = new files.DocumentFiles()
    await store.save(content(), destination)
    await fs.mkdir(`${destination}.bak`)
    await expect(store.save(content('Must stay pending'))).rejects.toThrow()
    expect(await fs.readFile(destination, 'utf8')).toBe(content())
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    await fs.rm(`${destination}.bak`, { recursive: true })
    await store.save(content('Retry after backup repair'))
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('Retry after backup repair')
  })

  it('retries persistence of file locations after a metadata write failure', async () => {
    const destination = path.join(directory, 'saved.scripy')
    const profile = path.join(directory, 'profile')
    await fs.writeFile(profile, 'This regular file blocks the metadata directory.')
    const sessionPath = path.join(profile, 'file-locations.json')
    const store = new files.DocumentFiles({ sessionPath })
    await expect(store.save(content(), destination)).rejects.toThrow()
    expect(await fs.readFile(destination, 'utf8')).toBe(content())
    await fs.rm(profile)
    await fs.mkdir(profile)
    await store.save(content())
    const reopened = new files.DocumentFiles({ sessionPath })
    expect(await reopened.location()).toEqual({
      id: 'fault-test-document',
      path: destination,
      name: 'saved.scripy',
    })
  })

  it('detects an external edit arriving while its temporary save is being written', async () => {
    const destination = path.join(directory, 'racing.scripy')
    const store = new files.DocumentFiles()
    await store.save(content(), destination)
    const entered = gate()
    const resume = gate()
    const open = fs.open
    vi.spyOn(fs, 'open').mockImplementation(async (...arguments_) => {
      const handle = await open(...arguments_)
      if (String(arguments_[0]).includes('.racing.scripy.') && String(arguments_[0]).endsWith('.tmp')) {
        entered.resolve()
        await resume.promise
      }
      return handle
    })
    const pending = store.save(content('Our pending edit')).then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    await entered.promise
    try {
      await fs.writeFile(destination, content('External edit during our save'))
    } finally {
      resume.resolve()
    }
    const result = await pending
    expect(result.error?.message).toContain('changed on disk')
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).title).toBe('External edit during our save')
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects a second independent writer during the final file replacement', async () => {
    const destination = path.join(directory, 'competing.scripy')
    const first = new files.DocumentFiles()
    const second = new files.DocumentFiles()
    await first.save(content(), destination)
    const opened = await second.open(destination)
    await second.bind(opened.token, 'fault-test-document')
    const entered = gate()
    const resume = gate()
    let held = false
    const rename = fs.rename
    vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
      if (target === destination && !held) {
        held = true
        entered.resolve()
        await resume.promise
      }
      return rename(source, target)
    })
    const firstSave = first.save(content('First protected save'))
    await entered.promise
    let secondError
    try {
      await second.save(content('Competing save'))
    } catch (error) {
      secondError = error
    } finally {
      resume.resolve()
    }
    await firstSave
    expect(secondError?.message).toMatch(/another instance|changed on disk/)
    expect(await fs.readFile(destination, 'utf8')).toBe(content('First protected save'))
    expect(await fs.readFile(`${destination}.bak`, 'utf8')).toBe(content())
    await expect(second.save(content('Stale retry'))).rejects.toThrow('changed on disk')
    expect((await fs.readdir(directory)).filter((name) => /\.(tmp|lock)$/.test(name))).toEqual([])
  })

  it('rejects corrupt UTF-8 rather than replacing damaged bytes in a screenplay', async () => {
    const destination = path.join(directory, 'bad-encoding.scripy')
    const original = Buffer.from(content())
    const position = original.indexOf('A protected first line.')
    original[position] = 0xff
    await fs.writeFile(destination, original)
    await expect(files.readDocument(destination)).rejects.toThrow('UTF-8')
    expect(await fs.readFile(destination)).toEqual(original)
  })

  it('rejects a fresh foreign lock and recovers a stale crash lock', async () => {
    const destination = path.join(directory, 'crash-recovery.scripy')
    const store = new files.DocumentFiles()
    await store.save(content(), destination)
    const lockPath = `${destination}.lock`
    await fs.mkdir(lockPath)
    await expect(store.save(content('Must wait'))).rejects.toThrow('another instance')
    await expect(store.save(content('Must also wait'), destination)).rejects.toThrow('another instance')
    expect(await fs.readFile(destination, 'utf8')).toBe(content())
    const stale = new Date(Date.now() - 60000)
    await fs.utimes(lockPath, stale, stale)
    await store.save(content('Recovered after crash'))
    expect(await fs.readFile(destination, 'utf8')).toBe(content('Recovered after crash'))
    expect(await fs.readFile(`${destination}.bak`, 'utf8')).toBe(content())
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.lock'))).toEqual([])
  })

  it('rejects malformed JSON roots with a document error, not a raw TypeError', () => {
    for (const source of ['null', '[]', '42', 'true', '"text"']) {
      expect(() => files.documentId(source), source).toThrow('Invalid Scripy document')
    }
  })

  it('preserves a symbolic link and writes to its canonical screenplay path', async () => {
    const destination = path.join(directory, 'actual.scripy')
    const link = path.join(directory, 'shortcut.scripy')
    await fs.writeFile(destination, content())
    await fs.symlink(destination, link)
    const store = new files.DocumentFiles()
    const opened = await store.open(link)
    await store.bind(opened.token, 'fault-test-document')
    await store.save(content('Saved through the link'))
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(link, 'utf8')).toBe(content('Saved through the link'))
    expect((await store.location()).path).toBe(destination)
  })

  it('does not forget an existing path when accepting another file fails', async () => {
    const firstPath = path.join(directory, 'first.scripy')
    const secondPath = path.join(directory, 'second.scripy')
    const sessionPath = path.join(directory, 'file-locations.json')
    const store = new files.DocumentFiles({ sessionPath })
    await store.save(content(), firstPath)
    await fs.writeFile(secondPath, content('A different version'))
    const opened = await store.open(secondPath)
    const rename = fs.rename
    vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
      if (target === sessionPath) throw new Error('Cannot persist the new path')
      return rename(source, target)
    })
    await expect(store.bind(opened.token, 'fault-test-document')).rejects.toThrow(
      'Cannot persist the new path',
    )
    expect((await store.location()).path).toBe(firstPath)
    vi.restoreAllMocks()
    await store.bind(opened.token, 'fault-test-document')
    expect((await store.location()).path).toBe(secondPath)
  })
})
