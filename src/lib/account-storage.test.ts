import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocumentStorage } from './storage'
import { createScreenplay } from './screenplay'

afterEach(() => vi.unstubAllGlobals())

it('isolates projects, history, recovery, and writer locks by Google account', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  const first = createDocumentStorage(`first-${crypto.randomUUID()}`)
  const second = createDocumentStorage(`second-${crypto.randomUUID()}`)
  const screenplay = createScreenplay('Private screenplay')
  try {
    await first.saveProject(screenplay, true)
    first.writeEmergency(screenplay)
    expect((await first.loadActiveProject())?.title).toBe('Private screenplay')
    expect(await second.loadActiveProject()).toBeNull()
    expect(second.readEmergency()).toBeNull()
    expect(await second.listProjects()).toEqual([])
    expect(await second.listSnapshots(screenplay.id)).toEqual([])
    expect(first.lockName).not.toBe(second.lockName)
    await second.saveProject({ ...screenplay, title: 'Other account copy' }, true)
    expect((await first.listProjects())[0].title).toBe('Private screenplay')
    expect((await second.listProjects())[0].title).toBe('Other account copy')
  } finally {
    await first.closeStorage()
    await second.closeStorage()
  }
})
