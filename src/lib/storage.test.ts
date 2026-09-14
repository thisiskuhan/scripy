import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createScreenplay } from './screenplay'
import { closeStorage, listProjects, listSnapshots, loadActiveProject, saveProject } from './storage'

afterEach(closeStorage)

describe('durable local storage', () => {
  it('saves and restores the active project including scene notes', async () => {
    const project = createScreenplay('A durable draft')
    project.notes[project.blocks[0].id] = 'A note that survives a restart.'
    await saveProject(project, true)
    expect(await loadActiveProject()).toEqual(project)
    expect((await listProjects()).find((item) => item.id === project.id)).toEqual(project)
    expect((await listSnapshots(project.id))[0].project).toEqual(project)
  })

  it('retains the twenty most recent recovery snapshots', async () => {
    const project = createScreenplay('Snapshots')
    for (let index = 0; index < 24; index += 1) await saveProject(project, true, `Draft ${index}`)
    expect(await listSnapshots(project.id)).toHaveLength(20)
  })

  it('keeps immutable snapshots isolated by screenplay across later saves and reloads', async () => {
    const first = createScreenplay('First screenplay')
    first.notes[first.blocks[0].id] = 'Original note'
    const original = structuredClone(first)
    await saveProject(first, true, 'Original')
    first.blocks[0].text = 'INT. CHANGED - DAY'
    first.notes[first.blocks[0].id] = 'Revised note'
    first.paperSize = 'a4'
    await saveProject(first)
    const second = createScreenplay('Second screenplay')
    await saveProject(second, true, 'Other screenplay')
    await closeStorage()
    const snapshots = await listSnapshots(first.id)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].project).toEqual(original)
    expect((await listSnapshots(second.id)).map((snapshot) => snapshot.project)).toEqual([second])
    expect((await listProjects()).find((project) => project.id === first.id)).toEqual(first)
  })

  it('rejects corrupted writes without overwriting the previous draft', async () => {
    const project = createScreenplay('Protected draft')
    await saveProject(project)
    await expect(saveProject({ ...project, blocks: [] })).rejects.toThrow('between 1')
    expect(await loadActiveProject()).toEqual(project)
  })
})
