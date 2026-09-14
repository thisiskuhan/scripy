import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { parseProject, serializeProject, validateScreenplay, type Screenplay } from './screenplay'

export interface Snapshot {
  id: string
  projectId: string
  savedAt: string
  label: string
  project: Screenplay
}
interface ScripyDB extends DBSchema {
  projects: { key: string; value: Screenplay }
  snapshots: { key: string; value: Snapshot; indexes: { 'by-project': string } }
  settings: { key: string; value: string }
}

export function createDocumentStorage(accountId = '') {
  const suffix = accountId ? `.${encodeURIComponent(accountId)}` : ''
  const recoveryKey = `scripy.emergency.v1${suffix}`
  let database: Promise<IDBPDatabase<ScripyDB>> | undefined

  function db() {
    database ??= openDB<ScripyDB>(`scripy-studio${suffix}`, 1, {
      upgrade(store) {
        store.createObjectStore('projects', { keyPath: 'id' })
        store.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('by-project', 'projectId')
        store.createObjectStore('settings')
      },
      blocking() {
        void database?.then((store) => store.close())
        database = undefined
      },
    }).catch((error: unknown) => {
      database = undefined
      throw error
    })
    return database
  }

  function writeEmergency(project: Screenplay): void {
    localStorage.setItem(recoveryKey, serializeProject(project))
  }

  function readEmergency(): Screenplay | null {
    const value = localStorage.getItem(recoveryKey)
    if (!value) return null
    return parseProject(value)
  }

  async function saveProject(project: Screenplay, checkpoint = false, label = 'Autosave'): Promise<void> {
    const safe: Screenplay = JSON.parse(serializeProject(project))
    const store = await db()
    const transaction = store.transaction(['projects', 'settings', 'snapshots'], 'readwrite')
    try {
      await transaction.objectStore('projects').put(safe)
      await transaction.objectStore('settings').put(safe.id, 'active-project')
      if (checkpoint) {
        const snapshots = transaction.objectStore('snapshots')
        const existing = await snapshots.index('by-project').getAll(safe.id)
        existing.sort((first, second) => second.savedAt.localeCompare(first.savedAt))
        const latest = existing.length ? Date.parse(existing[0].savedAt) : 0
        const savedAt = new Date(Math.max(Date.now(), Number.isFinite(latest) ? latest + 1 : 0)).toISOString()
        await snapshots.put({
          id: crypto.randomUUID(),
          projectId: safe.id,
          savedAt,
          label,
          project: safe,
        })
        for (const stale of existing.slice(19)) await snapshots.delete(stale.id)
      }
      await transaction.done
    } catch (error) {
      try {
        transaction.abort()
      } catch {
        await transaction.done.catch(() => undefined)
      }
      await transaction.done.catch(() => undefined)
      throw error
    }
  }

  async function loadActiveProject(): Promise<Screenplay | null> {
    const store = await db()
    const active = await store.get('settings', 'active-project')
    const stored = active ? await store.get('projects', active) : null
    let emergency: Screenplay | null = null
    try {
      emergency = readEmergency()
    } catch {
      emergency = null
    }
    let project: Screenplay | null = null
    try {
      project = stored ? validateScreenplay(stored) : null
    } catch (error) {
      if (emergency?.id === active) return emergency
      throw error
    }
    if (
      emergency &&
      (!project ||
        (emergency.id === project.id && Date.parse(emergency.updatedAt) >= Date.parse(project.updatedAt)))
    )
      return emergency
    return project ?? emergency
  }

  async function listProjects(): Promise<Screenplay[]> {
    const store = await db()
    return (await store.getAll('projects'))
      .map(validateScreenplay)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  }

  async function listSnapshots(projectId: string): Promise<Snapshot[]> {
    const store = await db()
    return (await store.getAllFromIndex('snapshots', 'by-project', projectId))
      .map((snapshot) => ({ ...snapshot, project: validateScreenplay(snapshot.project) }))
      .sort((first, second) => second.savedAt.localeCompare(first.savedAt))
  }

  async function closeStorage(): Promise<void> {
    if (database) (await database).close()
    database = undefined
  }

  return {
    lockName: `scripy-workspace-writer${suffix}`,
    writeEmergency,
    readEmergency,
    saveProject,
    loadActiveProject,
    listProjects,
    listSnapshots,
    closeStorage,
  }
}

export type DocumentStorage = ReturnType<typeof createDocumentStorage>
export const localDocumentStorage = createDocumentStorage()
export const {
  writeEmergency,
  readEmergency,
  saveProject,
  loadActiveProject,
  listProjects,
  listSnapshots,
  closeStorage,
} = localDocumentStorage
