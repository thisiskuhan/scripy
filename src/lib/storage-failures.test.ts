import 'fake-indexeddb/auto'
import { openDB, deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScreenplay, makeBlock, serializeProject } from './screenplay'
import { closeStorage, listSnapshots, loadActiveProject, saveProject, writeEmergency } from './storage'

const recoveryKey = 'scripy.emergency.v1'
let values: Map<string, string>

beforeEach(async () => {
  await closeStorage()
  await deleteDB('scripy-studio')
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await closeStorage()
})

describe('storage failure isolation', () => {
  it('falls back to the durable draft when the emergency copy is malformed', async () => {
    const project = createScreenplay('Durable draft')
    await saveProject(project)
    values.set(recoveryKey, '{not valid JSON')
    expect(await loadActiveProject()).toEqual(project)
  })

  it('does not let an unrelated newer recovery copy replace the chosen project', async () => {
    const project = { ...createScreenplay('Chosen project'), updatedAt: '2026-01-01T00:00:00.000Z' }
    await saveProject(project)
    writeEmergency({ ...createScreenplay('Unrelated draft'), updatedAt: '2099-01-01T00:00:00.000Z' })
    expect(await loadActiveProject()).toEqual(project)
  })

  it('recovers last-moment edits that have the same millisecond timestamp', async () => {
    const project = createScreenplay('Fast editing')
    await saveProject(project)
    const recovery = { ...project, blocks: [makeBlock('action', 'Typed before the next millisecond.')] }
    writeEmergency(recovery)
    expect(await loadActiveProject()).toEqual(recovery)
  })

  it('recovers from a valid emergency draft when the durable record is corrupted', async () => {
    const project = createScreenplay('Recovered draft')
    await saveProject(project)
    writeEmergency(project)
    const database = await openDB('scripy-studio', 1)
    await database.put('projects', { ...project, blocks: [], updatedAt: '2099-01-01T00:00:00.000Z' })
    database.close()
    expect(await loadActiveProject()).toEqual(project)
  })

  it('leaves the active draft and old snapshots unchanged when checkpoint insertion fails', async () => {
    const original = createScreenplay('Original draft')
    await saveProject(original, true, 'Original snapshot')
    const changed = { ...original, title: 'Must not partially commit' }
    const put = IDBObjectStore.prototype.put
    const injected = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'snapshots') throw new DOMException('Injected quota failure', 'QuotaExceededError')
      return key === undefined ? put.call(this, value) : put.call(this, value, key)
    })
    await expect(saveProject(changed, true, 'Failing checkpoint')).rejects.toThrow('Injected quota failure')
    injected.mockRestore()
    expect(await loadActiveProject()).toEqual(original)
    expect((await listSnapshots(original.id)).map((snapshot) => snapshot.label)).toEqual([
      'Original snapshot',
    ])
  })

  it('does not delete an old snapshot if adding its replacement fails', async () => {
    const project = createScreenplay('Snapshot retention')
    for (let index = 0; index < 20; index += 1) await saveProject(project, true, `Checkpoint ${index}`)
    const before = await listSnapshots(project.id)
    const put = IDBObjectStore.prototype.put
    const injected = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'snapshots') throw new DOMException('Disk full', 'QuotaExceededError')
      return key === undefined ? put.call(this, value) : put.call(this, value, key)
    })
    await expect(saveProject(project, true, 'Failed replacement')).rejects.toThrow('Disk full')
    injected.mockRestore()
    expect(await listSnapshots(project.id)).toEqual(before)
  })

  it('retains the latest twenty snapshots even if the clock does not advance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-14T10:00:00.000Z'))
    const project = createScreenplay('Rapid snapshots')
    for (let index = 0; index < 25; index += 1) await saveProject(project, true, `Version ${index}`)
    expect((await listSnapshots(project.id)).map((snapshot) => snapshot.label)).toEqual(
      Array.from({ length: 20 }, (_, index) => `Version ${24 - index}`),
    )
  })

  it('does not save a document locally that cannot be exported under the file limit', async () => {
    const original = createScreenplay('Within limits')
    await saveProject(original)
    const oversized = {
      ...original,
      blocks: Array.from({ length: 60 }, (_, index) => ({
        id: `large-${index}`,
        kind: 'action' as const,
        text: '\u00e9'.repeat(90000),
      })),
    }
    expect(() => serializeProject(oversized)).toThrow('5 MB')
    await expect(saveProject(oversized)).rejects.toThrow('5 MB')
    expect(await loadActiveProject()).toEqual(original)
  })

  it('remains usable when emergency storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Blocked storage', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('Blocked storage', 'SecurityError')
      },
    })
    const project = createScreenplay('IndexedDB still works')
    await saveProject(project)
    expect(await loadActiveProject()).toEqual(project)
  })
})
