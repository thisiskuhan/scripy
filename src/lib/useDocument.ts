import { startTransition, useEffect, useRef, useState } from 'react'
import { serializeProject, type Screenplay, type ScriptBlock } from './screenplay'
import { localDocumentStorage, type DocumentStorage } from './storage'
import type { NoteRange } from './annotations'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function useDocument(
  initial: Screenplay,
  recovered = false,
  storage: DocumentStorage = localDocumentStorage,
  hasInitialDocument = true,
) {
  const { loadActiveProject, saveProject, writeEmergency } = storage
  const [project, setProject] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>(recovered ? 'unsaved' : 'saved')
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [writable, setWritable] = useState(false)
  const [waitingForWriter, setWaitingForWriter] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [pendingWrites, setPendingWrites] = useState(0)
  const current = useRef(initial)
  const hasDocument = useRef(hasInitialDocument)
  const removedNotes = useRef(new Map<string, string>())
  const statusRef = useRef<SaveStatus>(recovered ? 'unsaved' : 'saved')
  const switching = useRef<Promise<void> | null>(null)
  const queue = useRef(Promise.resolve())
  const lastSnapshot = useRef(Date.now())
  const dirtySince = useRef<number | null>(recovered ? Date.now() : null)
  const saveFailures = useRef(0)
  const retryAt = useRef(0)
  const writableRef = useRef(false)
  const localStorageAvailable = useRef(true)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    let release: (() => void) | undefined
    const controller = new AbortController()
    const locks = navigator.locks
    setWritable(false)
    setWaitingForWriter(false)
    const takeOwnership = async (lock: Lock | null) => {
      if (cancelled || !lock) return
      setWaitingForWriter(false)
      const fresh = await loadActiveProject()
      if (cancelled) return
      if (fresh) hasDocument.current = true
      if (fresh && (fresh.id !== current.current.id || fresh.updatedAt !== current.current.updatedAt)) {
        removedNotes.current.clear()
        current.current = fresh
        setProject(fresh)
        setGeneration((value) => value + 1)
      }
      writableRef.current = true
      setWritable(true)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    if (locks) {
      void Promise.resolve()
        .then(() => {
          if (cancelled) return
          return locks.request(storage.lockName, { ifAvailable: true }, (lock) => {
            if (cancelled) return
            if (lock) return takeOwnership(lock)
            setWaitingForWriter(true)
            return locks.request(storage.lockName, { signal: controller.signal }, takeOwnership)
          })
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setWaitingForWriter(false)
            setError(reason instanceof Error ? reason.message : 'Editing ownership could not be acquired.')
          }
        })
    } else {
      setError(
        'This browser cannot guarantee exclusive editing. Use a current browser over HTTPS or the desktop app.',
      )
    }
    return () => {
      if (writableRef.current && statusRef.current !== 'saved') {
        try {
          writeEmergency(current.current)
        } catch {
          localStorageAvailable.current = false
        }
        void persistRef.current(false, 'Session recovery', false).catch(() => undefined)
      }
      cancelled = true
      alive.current = false
      writableRef.current = false
      controller.abort()
      release?.()
    }
  }, [storage, loadActiveProject, writeEmergency])

  function changeStatus(next: SaveStatus) {
    if (next === 'unsaved') dirtySince.current ??= Date.now()
    if (next === 'saved') {
      dirtySince.current = null
      saveFailures.current = 0
      retryAt.current = 0
    }
    statusRef.current = next
    if (alive.current) setStatus(next)
  }

  async function persist(checkpoint = false, label = 'Autosave', writeToDisk = true): Promise<void> {
    if (switching.current) await switching.current
    if (!writableRef.current || !hasDocument.current) return
    const snapshot = current.current
    if (alive.current) setPendingWrites((count) => count + 1)
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
        let recoveryFailed = false
        let recoveryError: unknown
        try {
          await saveProject(snapshot, shouldCheckpoint, label)
          if (shouldCheckpoint) lastSnapshot.current = Date.now()
        } catch (reason) {
          recoveryFailed = true
          recoveryError = reason
        }
        if (writeToDisk && window.scripyDesktop)
          await window.scripyDesktop.autosave(serializeProject(snapshot))
        if (recoveryFailed) throw recoveryError
        if (alive.current && (writeToDisk || !window.scripyDesktop)) {
          saveFailures.current = 0
          retryAt.current = 0
          if (current.current === snapshot) changeStatus('saved')
          else {
            dirtySince.current = Date.now()
            changeStatus('unsaved')
          }
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (alive.current) {
          saveFailures.current += 1
          retryAt.current = Date.now() + Math.min(1000 * 2 ** Math.min(saveFailures.current - 1, 2), 4000)
          changeStatus('error')
          setError(
            reason instanceof Error
              ? reason.message
              : 'Your draft could not be saved. Export a document copy now.',
          )
        }
        throw reason
      })
      .finally(() => {
        if (alive.current) setPendingWrites((count) => count - 1)
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
    if (!writable || !hasDocument.current || pendingWrites > 0 || status === 'saved' || status === 'saving')
      return
    if (saveFailures.current > 3) return
    const delay =
      saveFailures.current > 0
        ? Math.max(0, retryAt.current - Date.now())
        : Math.min(450, Math.max(0, 5000 - (Date.now() - (dirtySince.current ?? Date.now()))))
    const timer = window.setTimeout(() => {
      void persistRef.current().catch(() => undefined)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [project, writable, status, pendingWrites])

  useEffect(() => {
    const emergency = () => {
      if (!writableRef.current || !hasDocument.current) return
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
  }, [writeEmergency])

  function update(change: (previous: Screenplay) => Screenplay, options: { immediate?: boolean } = {}) {
    if (!writableRef.current || switching.current || !hasDocument.current) return false
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
    if (saveFailures.current > 3) {
      saveFailures.current = 0
      retryAt.current = 0
      dirtySince.current = Date.now()
    }
    setEditError('')
    if (options.immediate) setProject(next)
    else startTransition(() => setProject(next))
    changeStatus('unsaved')
    return true
  }

  function updateBlocks(blocks: ScriptBlock[], ranges?: Map<string, NoteRange[]>) {
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
      const annotations = previous.annotations.map((note) => ({
        ...note,
        ranges: ranges ? (ranges.get(note.id) ?? []) : note.ranges.filter((range) => ids.has(range.blockId)),
      }))
      return { ...previous, blocks, notes, annotations }
    })
  }

  async function switchProject(
    next: Screenplay,
    label = 'Opened document',
    acceptFile?: () => Promise<void>,
    writePreviousToDisk = !acceptFile,
  ) {
    if (!writableRef.current) throw new Error('This workspace is being edited in another tab.')
    if (switching.current) throw new Error('Another document is still opening.')
    const previous = current.current
    const operation = (async () => {
      await persist(true, 'Before switching documents', writePreviousToDisk)
      await saveProject(next, true, label)
      try {
        await acceptFile?.()
      } catch (reason) {
        if (hasDocument.current) await saveProject(previous)
        throw reason
      }
      try {
        writeEmergency(next)
      } catch {
        localStorageAvailable.current = false
      }
      removedNotes.current.clear()
      hasDocument.current = true
      saveFailures.current = 0
      retryAt.current = 0
      dirtySince.current = null
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
    hasDocument: hasDocument.current,
    current,
    status,
    error: error || editError,
    writable,
    waitingForWriter,
    generation,
    update,
    updateBlocks,
    persist,
    switchProject,
    failSave,
  }
}
