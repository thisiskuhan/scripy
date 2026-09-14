import { startTransition, useEffect, useRef, useState } from 'react'
import { serializeProject, type Screenplay, type ScriptBlock } from './screenplay'
import { loadActiveProject, saveProject, writeEmergency } from './storage'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function useDocument(initial: Screenplay, recovered = false) {
  const [project, setProject] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>(recovered ? 'unsaved' : 'saved')
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [writable, setWritable] = useState(false)
  const [generation, setGeneration] = useState(0)
  const current = useRef(initial)
  const removedNotes = useRef(new Map<string, string>())
  const statusRef = useRef<SaveStatus>(recovered ? 'unsaved' : 'saved')
  const switching = useRef<Promise<void> | null>(null)
  const queue = useRef(Promise.resolve())
  const lastSnapshot = useRef(Date.now())
  const writableRef = useRef(false)
  const localStorageAvailable = useRef(true)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    let release: (() => void) | undefined
    const controller = new AbortController()
    if (navigator.locks) {
      void navigator.locks
        .request('scripy-workspace-writer', { signal: controller.signal }, async (lock) => {
          if (cancelled) return
          const fresh = await loadActiveProject()
          if (cancelled) return
          if (fresh && (fresh.id !== current.current.id || fresh.updatedAt !== current.current.updatedAt)) {
            removedNotes.current.clear()
            current.current = fresh
            setProject(fresh)
            setGeneration((value) => value + 1)
          }
          writableRef.current = Boolean(lock)
          setWritable(Boolean(lock))
          if (lock)
            await new Promise<void>((resolve) => {
              release = resolve
            })
        })
        .catch((reason: unknown) => {
          if (!cancelled)
            setError(reason instanceof Error ? reason.message : 'Editing ownership could not be acquired.')
        })
    } else {
      writableRef.current = true
      setWritable(true)
    }
    return () => {
      cancelled = true
      alive.current = false
      writableRef.current = false
      controller.abort()
      release?.()
    }
  }, [])

  function changeStatus(next: SaveStatus) {
    statusRef.current = next
    if (alive.current) setStatus(next)
  }

  async function persist(checkpoint = false, label = 'Autosave', writeToDisk = true): Promise<void> {
    if (switching.current) await switching.current
    if (!writableRef.current) return
    const snapshot = current.current
    if (writeToDisk) changeStatus('saving')
    const shouldCheckpoint = checkpoint || Date.now() - lastSnapshot.current >= 60000
    const operation = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (localStorageAvailable.current) {
          try {
            writeEmergency(snapshot)
          } catch {
            localStorageAvailable.current = false
          }
        }
        await saveProject(snapshot, shouldCheckpoint, label)
        if (writeToDisk && window.scripyDesktop)
          await window.scripyDesktop.autosave(serializeProject(snapshot))
        if (shouldCheckpoint) lastSnapshot.current = Date.now()
        if (alive.current && current.current === snapshot && (writeToDisk || !window.scripyDesktop)) {
          changeStatus('saved')
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (alive.current) {
          changeStatus('error')
          setError(
            reason instanceof Error
              ? reason.message
              : 'Your draft could not be saved. Export a document copy now.',
          )
        }
        throw reason
      })
    queue.current = operation
    return operation
  }

  const persistRef = useRef(persist)
  persistRef.current = persist

  useEffect(
    () =>
      window.scripyDesktop?.onBeforeClose(async () => {
        try {
          await persistRef.current()
          return true
        } catch {
          return false
        }
      }),
    [],
  )

  useEffect(() => {
    if (!writable || statusRef.current === 'saved') return
    const timer = window.setTimeout(() => {
      void persistRef.current().catch(() => undefined)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [project, writable])

  useEffect(() => {
    const emergency = () => {
      if (!writableRef.current) return
      try {
        writeEmergency(current.current)
      } catch {
        changeStatus('error')
      }
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        emergency()
        void persistRef.current().catch(() => undefined)
      }
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!writableRef.current || statusRef.current === 'saved') return
      emergency()
      if (statusRef.current === 'error') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('pagehide', emergency)
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', emergency)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])

  function update(change: (previous: Screenplay) => Screenplay) {
    if (!writableRef.current || switching.current) return false
    const next = {
      ...change(current.current),
      updatedAt: new Date(Math.max(Date.now(), Date.parse(current.current.updatedAt) + 1)).toISOString(),
    }
    try {
      serializeProject(next)
    } catch (reason) {
      setEditError(
        `The edit was not applied because it exceeds a document limit or contains invalid data. ${reason instanceof Error ? reason.message : ''}`,
      )
      return false
    }
    current.current = next
    setEditError('')
    startTransition(() => setProject(next))
    changeStatus('unsaved')
    return true
  }

  function updateBlocks(blocks: ScriptBlock[]) {
    return update((previous) => {
      const ids = new Set(blocks.map((block) => block.id))
      const notes: Record<string, string> = {}
      for (const [id, note] of Object.entries(previous.notes)) {
        if (ids.has(id)) notes[id] = note
        else removedNotes.current.set(id, note)
      }
      for (const id of ids) {
        if (!Object.prototype.hasOwnProperty.call(notes, id) && removedNotes.current.has(id))
          notes[id] = removedNotes.current.get(id)!
      }
      return { ...previous, blocks, notes }
    })
  }

  async function switchProject(
    next: Screenplay,
    label = 'Opened document',
    acceptFile?: () => Promise<void>,
  ) {
    if (!writableRef.current) throw new Error('This workspace is being edited in another tab.')
    if (switching.current) throw new Error('Another document is still opening.')
    const previous = current.current
    const operation = (async () => {
      await persist(true, 'Before switching documents', !acceptFile)
      await saveProject(next, true, label)
      try {
        await acceptFile?.()
      } catch (reason) {
        await saveProject(previous)
        throw reason
      }
      try {
        writeEmergency(next)
      } catch {
        localStorageAvailable.current = false
      }
      removedNotes.current.clear()
      current.current = next
      setProject(next)
      changeStatus(acceptFile ? 'saved' : 'unsaved')
      setError('')
      lastSnapshot.current = Date.now()
    })()
    switching.current = operation
    try {
      await operation
    } finally {
      switching.current = null
    }
  }

  function failSave(reason: unknown) {
    changeStatus('error')
    setError(
      reason instanceof Error ? reason.message : 'The file could not be saved. Use Save As to keep a copy.',
    )
  }

  return {
    project,
    current,
    status,
    error: error || editError,
    writable,
    generation,
    update,
    updateBlocks,
    persist,
    switchProject,
    failSave,
  }
}
