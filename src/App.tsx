import { useDeferredValue, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { version as appVersion } from '../package.json'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCheck,
  CloudDownload,
  CloudUpload,
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  FilePlus2,
  FileText,
  Film,
  Focus,
  FolderOpen,
  HardDrive,
  History,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minimize2,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Type,
  Undo2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Dialog } from './components/Dialog'
import { Brand } from './components/Brand'
import { FloatingNotifications, type Notice } from './components/FloatingNotifications'
import { TitleArtworkEditor } from './components/TitleArtworkEditor'
import { ScreenplayEditor, type EditorHandle, type EditorInfo } from './components/ScreenplayEditor'
import {
  ELEMENT_LABELS,
  ELEMENTS,
  MAX_FILE_BYTES,
  createScreenplay,
  exportFountain,
  fileName,
  getCharacters,
  getScenes,
  importFountain,
  moveScene,
  parseProject,
  serializeProject,
  scripyFileName,
  wordCount,
  type ElementKind,
  type Screenplay,
} from './lib/screenplay'
import { paginate, type ScriptLayout } from './lib/layout'
import { PAPER_LABELS, PAPER_SIZES, paperMetrics, type PaperSize } from './lib/paper'
import type { TitleArtwork } from './lib/artwork'
import {
  createDocumentStorage,
  localDocumentStorage,
  type DocumentStorage,
  type Snapshot,
} from './lib/storage'
import { sampleScreenplay } from './lib/sample'
import { useDocument } from './lib/useDocument'
import { chooseReopenedDraft } from './lib/reopen'
import { exportPdf } from './lib/pdf-export'
import { useTheme, type Appearance } from './lib/useTheme'
import { useFullscreen } from './lib/useFullscreen'
import { PassageNoteForm, type NoteValues } from './components/PassageNoteForm'
import { PassageNoteList } from './components/PassageNoteList'
import { NotesView } from './components/NotesView'
import { passageText, type PassageNote, type PassageSelection } from './lib/annotations'
import { SidebarResizeHandle } from './components/SidebarResizeHandle'
import { SceneMemoField } from './components/SceneMemoField'
import { DEFAULT_PANEL_LAYOUT, panelBounds } from './lib/panels'
import { usePanels } from './lib/usePanels'
import { BrowserSession } from './components/BrowserSession'
import { CLOUD_FEATURES_ENABLED, DESKTOP_APP_URL } from './lib/deployment'
import { HomePage } from './components/HomePage'
import type { GoogleSession } from './lib/google-auth'
import { createGoogleDrive, type GoogleDrive } from './lib/google-drive'
import { DriveFilesDialog } from './components/DriveFilesDialog'

type Modal = 'new' | 'details' | 'export' | 'history' | 'projects' | 'settings' | 'note' | 'drive' | null
interface Preferences {
  zoom: string
  sceneNumbers: boolean
  spellcheck: boolean
  inspector: boolean
}
const defaultPreferences: Preferences = {
  zoom: 'fit',
  sceneNumbers: false,
  spellcheck: true,
  inspector: true,
}
interface StartupDocument {
  project: Screenplay
  warning: string
  recovered: boolean
  hasDocument: boolean
}
function initialDocument(storage: DocumentStorage) {
  const { loadActiveProject, saveProject, writeEmergency } = storage
  return loadActiveProject().then(async (stored) => {
    if (!CLOUD_FEATURES_ENABLED)
      return {
        project: stored ?? createScreenplay('Untitled screenplay'),
        warning: '',
        recovered: false,
        hasDocument: Boolean(stored),
      }
    let project = stored ?? sampleScreenplay()
    if (!stored) await saveProject(project, true, 'Initial draft')
    let warning = ''
    let recovered = false
    if (stored && window.scripyDesktop) {
      try {
        const file = await window.scripyDesktop.reopenDocument(stored.id)
        if (file?.token) {
          const disk = parseProject(file.content)
          const choice = chooseReopenedDraft(stored, disk, file.changedOnDisk)
          if (choice.preserveRecovery) await saveProject(stored, true, 'Before loading file from disk')
          await window.scripyDesktop.bindDocument(file.token, disk.id)
          project = choice.project
          recovered = choice.recovered
          await saveProject(project)
          try {
            writeEmergency(project)
          } catch {
            warning = 'Emergency recovery storage is unavailable; save a file copy regularly.'
          }
        }
      } catch (error) {
        warning = `The disk file could not be reopened. Your local recovery draft is shown. ${error instanceof Error ? error.message : 'Use Open or Save As to choose a file.'}`
      }
    }
    return { project, warning, recovered, hasDocument: true }
  })
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
  hint,
}: {
  icon: LucideIcon
  label: string
  onClick(): void
  active?: boolean
  disabled?: boolean
  className?: string
  hint?: string
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={hint ? `${label} (${hint})` : label}
      aria-keyshortcuts={hint}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={17} strokeWidth={1.7} />
    </button>
  )
}

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

async function download(data: string | ArrayBuffer, name: string, type: string) {
  const blob = new Blob([data], { type })
  if (window.scripyDesktop)
    return window.scripyDesktop.exportFile(
      new Uint8Array(await blob.arrayBuffer()),
      name,
      name.split('.').pop()!,
    )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  return true
}

function Workspace({
  initial,
  hasInitialDocument,
  warning,
  recovered,
  appearance,
  storage,
  session,
  onSignOut,
  drive,
}: {
  initial: Screenplay
  hasInitialDocument: boolean
  warning: string
  recovered: boolean
  appearance: Appearance
  storage: DocumentStorage
  session?: GoogleSession
  onSignOut?: () => void
  drive?: GoogleDrive
}) {
  const { listProjects, listSnapshots } = storage
  const doc = useDocument(initial, recovered, storage, hasInitialDocument)
  const panels = usePanels()
  const fullscreen = useFullscreen()
  const { project } = doc
  const editor = useRef<EditorHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const findInput = useRef<HTMLInputElement>(null)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<'script' | 'outline' | 'notes'>('script')
  const [sidebarTab, setSidebarTab] = useState<'scenes' | 'characters'>('scenes')
  const [sceneFilter, setSceneFilter] = useState('')
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [mobileNotes, setMobileNotes] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [homeVisible, setHomeVisible] = useState(!CLOUD_FEATURES_ENABLED)
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeError, setHomeError] = useState('')
  const [homeAttempt, setHomeAttempt] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [noteDraft, setNoteDraft] = useState<{
    id: string
    createdAt: string
    initialText: string
    note: PassageNote | null
    selection: PassageSelection
  } | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [deletingNote, setDeletingNote] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [dismissedError, setDismissedError] = useState('')
  const [operationError, setOperationError] = useState(warning)
  const [fileLocation, setFileLocation] = useState<DesktopLocation | null>(null)
  const fileOperation = useRef(false)
  const [busy, setBusy] = useState(false)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [projects, setProjects] = useState<Screenplay[]>([])
  const [confirmSnapshot, setConfirmSnapshot] = useState<string | null>(null)
  const [format, setFormat] = useState<'pdf' | 'fountain' | 'scripy'>('pdf')
  const [exportDate, setExportDate] = useState(() => new Date())
  const [titlePage, setTitlePage] = useState(true)
  const [detailsTitle, setDetailsTitle] = useState('')
  const [detailsAuthor, setDetailsAuthor] = useState('')
  const [detailsPaperSize, setDetailsPaperSize] = useState<PaperSize>('letter')
  const [detailsArtwork, setDetailsArtwork] = useState<TitleArtwork | null>(null)
  const [artworkBusy, setArtworkBusy] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [availableWidth, setAvailableWidth] = useState(920)
  const [layout, setLayout] = useState<ScriptLayout>(() => paginate(initial.blocks, initial.paperSize))
  const [info, setInfo] = useState<EditorInfo>({
    blockId: initial.blocks[0].id,
    kind: initial.blocks[0].kind,
    page: 1,
    pages: layout.pageCount,
    canUndo: false,
    canRedo: false,
    passage: null,
  })
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('scripy.preferences') || '{}') as Partial<Preferences>
      return {
        zoom: ['fit', '0.75', '1', '1.25'].includes(stored.zoom ?? '') ? stored.zoom! : 'fit',
        sceneNumbers: stored.sceneNumbers === true,
        spellcheck: stored.spellcheck !== false,
        inspector: stored.inspector !== false,
      }
    } catch {
      return defaultPreferences
    }
  })
  const deferredBlocks = useDeferredValue(project.blocks)
  const scenes = getScenes(deferredBlocks)
  const characters = getCharacters(deferredBlocks)
  const totalWords = deferredBlocks.reduce((total, block) => total + wordCount(block.text), 0)
  const currentIndex = project.blocks.findIndex((block) => block.id === info.blockId)
  const activeScene = [...scenes].reverse().find((scene) => scene.start <= currentIndex) ?? scenes[0]
  const noteSceneBlocks = new Set(
    project.blocks
      .slice(activeScene?.start ?? 0, activeScene?.end ?? project.blocks.length)
      .map((block) => block.id),
  )
  const filteredScenes = scenes.filter((scene) =>
    scene.heading.toLowerCase().includes(sceneFilter.toLowerCase()),
  )
  const paper = paperMetrics(project.paperSize)
  const fitZoom = Math.max(
    0.28,
    Math.min(0.95, (availableWidth - (availableWidth < 600 ? 28 : 72)) / paper.width),
  )
  const zoom = preferences.zoom === 'fit' ? fitZoom : Number(preferences.zoom)
  const navigationVisible = panels.viewport <= 800 ? mobileSidebar : !panels.layout.navigationCollapsed
  const notesVisible =
    !focusMode && view !== 'notes' && preferences.inspector && (panels.viewport <= 1100 ? mobileNotes : true)
  const sidebarSizes = panelBounds(panels.viewport, panels.layout, navigationVisible, notesVisible)
  const activeError =
    doc.error ||
    fullscreen.error ||
    operationError ||
    appearance.error ||
    (doc.waitingForWriter ? 'This workspace is open in another tab. Editing is paused here.' : '')
  useEffect(() => {
    if (!activeError) setDismissedError('')
  }, [activeError])

  function toggleNavigation() {
    if (panels.viewport <= 800) {
      setMobileNotes(false)
      setMobileSidebar((previous) => !previous)
    } else
      panels.setLayout((previous) => ({ ...previous, navigationCollapsed: !previous.navigationCollapsed }))
  }

  function toggleNotes() {
    setMobileSidebar(false)
    if (view === 'notes') {
      setView('script')
      setPreferences((previous) => ({ ...previous, inspector: true }))
      if (window.innerWidth <= 1100) setMobileNotes(true)
      return
    }
    if (window.innerWidth <= 1100) {
      setMobileNotes((value) => !value)
      setPreferences((value) => ({ ...value, inspector: true }))
    } else setPreferences((value) => ({ ...value, inspector: !value.inspector }))
  }

  function editPassageNote(note: PassageNote | null = null, initialText = '') {
    if (!doc.writable || busy || fileOperation.current) return
    const sceneBlock = project.blocks.find((block) => block.id === activeScene?.id)
    const selection = note
      ? { quote: passageText(note, project.blocks), ranges: note.ranges }
      : (info.passage ??
        (sceneBlock?.text.trim()
          ? {
              quote: sceneBlock.text,
              ranges: [{ blockId: sceneBlock.id, from: 0, to: sceneBlock.text.length }],
            }
          : null))
    if (!selection) return
    setToast('')
    setNoteDraft({
      id: note?.id ?? crypto.randomUUID(),
      createdAt: note?.createdAt ?? new Date().toISOString(),
      initialText,
      note,
      selection,
    })
    showModal('note')
  }

  function showNotesView() {
    closeFind()
    setMobileNotes(false)
    setView('notes')
  }

  async function savePassageNote(values: NoteValues) {
    if (!noteDraft || !doc.writable || fileOperation.current) return
    const now = new Date().toISOString()
    const note: PassageNote = {
      id: noteDraft.id,
      createdAt: noteDraft.createdAt,
      updatedAt: now,
      text: values.text,
      departments: values.departments,
      tags: values.tags,
      resolved: values.resolved,
      quote: values.selection.quote,
      ranges: values.selection.ranges,
    }
    fileOperation.current = true
    setBusy(true)
    try {
      if (
        !doc.update((previous) => ({
          ...previous,
          annotations: previous.annotations.some((item) => item.id === note.id)
            ? previous.annotations.map((item) => (item.id === note.id ? note : item))
            : [...previous.annotations, note],
        }))
      )
        return
      editor.current?.markNote(note)
      await doc.persist(true, 'Passage note saved')
      setActiveNoteId(note.id)
      setModal(null)
      setNoteDraft(null)
      setOperationError('')
      setToast('Note saved.')
    } catch (error) {
      report(error)
    } finally {
      fileOperation.current = false
      setBusy(false)
    }
  }

  async function saveSceneMemo() {
    if (!doc.writable || fileOperation.current) return
    fileOperation.current = true
    setBusy(true)
    try {
      await doc.persist(true, 'Scene memo saved')
      setOperationError('')
      setToast('Scene memo saved.')
    } catch (error) {
      report(error)
    } finally {
      fileOperation.current = false
      setBusy(false)
    }
  }

  function goToNote(note: PassageNote) {
    setView('script')
    setActiveNoteId(note.id)
    setMobileNotes(false)
    requestAnimationFrame(() => editor.current?.selectNote(note))
  }

  const noteActions = {
    disabled: !doc.writable || busy || deletingNote,
    onEdit: editPassageNote,
    onGo: goToNote,
    onResolve: (note: PassageNote) => {
      if (!doc.writable) return
      doc.update((previous) => ({
        ...previous,
        annotations: previous.annotations.map((item) =>
          item.id === note.id
            ? { ...item, resolved: !item.resolved, updatedAt: new Date().toISOString() }
            : item,
        ),
      }))
    },
    onDelete: async (note: PassageNote) => {
      if (!doc.writable || fileOperation.current) return
      fileOperation.current = true
      setDeletingNote(true)
      try {
        await doc.persist(true, 'Before deleting passage note', false)
        if (
          doc.update((previous) => ({
            ...previous,
            annotations: previous.annotations.filter((item) => item.id !== note.id),
          }))
        ) {
          editor.current?.removeNote(note.id)
          setToast('Note deleted.')
        }
      } catch (error) {
        report(error)
      } finally {
        fileOperation.current = false
        setDeletingNote(false)
      }
    },
  }

  useEffect(() => {
    document.title = homeVisible
      ? 'Home - Scripy'
      : `${project.title}${fileLocation ? ` - ${fileLocation.path}` : ''} - Scripy`
  }, [project.title, fileLocation, homeVisible])
  useEffect(() => {
    if (!homeVisible) return
    let active = true
    setHomeLoading(true)
    setHomeError('')
    void listProjects()
      .then((items) => {
        if (active) setProjects(items)
      })
      .catch((error) => {
        if (active)
          setHomeError(error instanceof Error ? error.message : 'Recent screenplays could not be loaded.')
      })
      .finally(() => {
        if (active) setHomeLoading(false)
      })
    return () => {
      active = false
    }
  }, [homeVisible, homeAttempt, listProjects, doc.generation])
  useEffect(() => {
    let active = true
    setFileLocation(null)
    if (window.scripyDesktop) {
      void window.scripyDesktop
        .getLocation(project.id)
        .then((location) => {
          if (active) setFileLocation(location)
        })
        .catch((error: unknown) => {
          if (active) report(error)
        })
    }
    return () => {
      active = false
    }
  }, [project.id])
  useEffect(() => {
    try {
      localStorage.setItem('scripy.preferences', JSON.stringify(preferences))
    } catch {
      setToast('Preferences could not be saved.')
    }
  }, [preferences])
  useEffect(() => {
    if (!preferences.inspector) setMobileNotes(false)
  }, [preferences.inspector])
  useEffect(() => {
    if (!toast || modal) return
    const timer = window.setTimeout(() => setToast(''), 6500)
    return () => window.clearTimeout(timer)
  }, [toast, modal])
  useEffect(() => {
    if (!canvas.current) return
    const observer = new ResizeObserver((entries) => setAvailableWidth(entries[0].contentRect.width))
    observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (findOpen) findInput.current?.focus()
  }, [findOpen])
  useEffect(() => {
    if (!findOpen) return
    setMatchCount(editor.current?.search(query) ?? 0)
  }, [query, findOpen])
  useEffect(() => {
    if (findOpen) setMatchCount(editor.current?.countMatches(query) ?? 0)
  }, [project.blocks, findOpen, query])

  function toggleFocus() {
    setView('script')
    setFocusMode((value) => !value)
  }
  function toggleTheme() {
    if (!appearance.chooseTheme(appearance.theme === 'dark' ? 'light' : 'dark'))
      setToast('Appearance changed, but the preference could not be saved.')
  }
  const actions = useRef<{
    save(saveAs: boolean): void
    find(): void
    toggleFocus(): void
    toggleTheme(): void
    escape(): void
  }>({
    save: () => {},
    find: () => {},
    toggleFocus: () => {},
    toggleTheme: () => {},
    escape: () => {},
  })
  actions.current = {
    save: (saveAs) => {
      if (saveAs) void saveFile(true)
      else void saveChanges()
    },
    find: () => {
      setView('script')
      setFindOpen(true)
    },
    toggleFocus,
    toggleTheme,
    escape: () => {
      setFocusMode(false)
      setMobileSidebar(false)
      setMobileNotes(false)
      setMenuOpen(false)
      closeFind()
    },
  }
  useEffect(() => {
    if (homeVisible) return
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!event.repeat && !event.altKey) actions.current.save(event.shiftKey)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        actions.current.find()
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.code === 'KeyF' &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault()
        if (!event.repeat) actions.current.toggleFocus()
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.code === 'KeyT' &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault()
        if (!event.repeat) actions.current.toggleTheme()
      }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) actions.current.escape()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [homeVisible])

  function report(error: unknown) {
    setDismissedError('')
    setToast('')
    setOperationError(error instanceof Error ? error.message : 'The operation could not be completed.')
  }
  function closeFind() {
    setFindOpen(false)
    setQuery('')
    editor.current?.search('')
  }
  function showModal(next: Modal) {
    if (next === 'export') setExportDate(new Date())
    if (next === 'new' || next === 'details') {
      setDetailsTitle(next === 'new' ? '' : doc.current.current.title)
      setDetailsAuthor(next === 'new' ? '' : doc.current.current.author)
      setDetailsPaperSize(doc.current.current.paperSize)
      setDetailsArtwork(next === 'new' ? null : doc.current.current.titleArtwork)
    }
    setOperationError('')
    setMenuOpen(false)
    setModal(next)
    setConfirmSnapshot(null)
  }
  async function switchTo(
    next: Screenplay,
    label?: string,
    acceptFile?: () => Promise<void>,
    writePreviousToDisk = !acceptFile,
  ) {
    await doc.switchProject(next, label, acceptFile, writePreviousToDisk)
    setRevision((value) => value + 1)
    setView('script')
    closeFind()
    setSceneFilter('')
    setModal(null)
    setHomeVisible(false)
    setMobileSidebar(false)
    canvas.current?.scrollTo({ top: 0 })
  }
  async function openFile() {
    setMenuOpen(false)
    if (window.scripyDesktop) {
      if (fileOperation.current) return
      fileOperation.current = true
      setBusy(true)
      try {
        const file = await window.scripyDesktop.openDocument()
        if (file) await importFile(file.content, file.name, file)
      } catch (error) {
        report(error)
      } finally {
        fileOperation.current = false
        setBusy(false)
      }
    } else fileInput.current?.click()
  }
  async function importFile(
    content: string,
    name: string,
    nativeFile?: DesktopOpenResult,
    recovery?: Screenplay,
    changedOnDisk = true,
  ): Promise<string> {
    let reopeningCurrentFile = false
    if (nativeFile && window.scripyDesktop) {
      const location = await window.scripyDesktop.getLocation(doc.current.current.id)
      reopeningCurrentFile = location?.path === nativeFile.path
      if (reopeningCurrentFile && !recovery) {
        const reopened = await window.scripyDesktop.reopenDocument(doc.current.current.id)
        if (!reopened) throw new Error('This file could not be reopened. Your current draft is unchanged.')
        return importFile(
          reopened.content,
          reopened.name,
          reopened,
          doc.current.current,
          reopened.changedOnDisk,
        )
      }
    }
    const disk = /\.(fountain|txt)$/i.test(name)
      ? importFountain(content, name.replace(/\.[^.]+$/, ''))
      : parseProject(content)
    const choice = recovery && nativeFile ? chooseReopenedDraft(recovery, disk, changedOnDisk) : null
    const next = choice?.project ?? disk
    if (choice?.preserveRecovery && recovery)
      await storage.saveProject(recovery, true, 'Before loading file from disk')
    const acceptFile = nativeFile
      ? async () => {
          const location = nativeFile.token
            ? await window.scripyDesktop!.bindDocument(nativeFile.token, next.id)
            : null
          setFileLocation(location)
        }
      : undefined
    if (recovery && serializeProject(next) === serializeProject(doc.current.current)) {
      await acceptFile?.()
      setModal(null)
      setHomeVisible(false)
    } else await switchTo(next, 'Imported document', acceptFile, !reopeningCurrentFile)
    if (choice?.recovered) await doc.persist(true, 'Recovered local changes')
    setOperationError('')
    setToast(`Imported ${name}`)
    return next.id
  }
  const drainOpenRequests = useRef(async () => {})
  drainOpenRequests.current = async () => {
    if (!window.scripyDesktop || !doc.writable || busy || modal || fileOperation.current) return
    fileOperation.current = true
    let changedBusy = false
    try {
      let request = await window.scripyDesktop.takeOpenRequest()
      while (request) {
        changedBusy = true
        setBusy(true)
        if (request.error) report(new Error(request.error))
        else if (request.file) {
          try {
            await importFile(request.file.content, request.file.name, request.file)
          } catch (error) {
            report(error)
          }
        }
        request = await window.scripyDesktop.takeOpenRequest()
      }
    } catch (error) {
      report(error)
    } finally {
      fileOperation.current = false
      if (changedBusy) setBusy(false)
    }
  }
  useEffect(() => {
    if (!window.scripyDesktop || !doc.writable) return
    const stop = window.scripyDesktop.onOpenRequest(() => {
      void drainOpenRequests.current()
    })
    void drainOpenRequests.current()
    return stop
  }, [doc.writable, busy, modal])
  async function saveChanges() {
    if (!doc.writable || fileOperation.current) return
    fileOperation.current = true
    setMenuOpen(false)
    setToast('')
    const snapshot = doc.current.current
    try {
      await doc.persist(true, 'Manual save')
      setOperationError('')
      if (doc.current.current === snapshot) setToast('Changes saved.')
    } catch {
      return
    } finally {
      fileOperation.current = false
    }
  }

  async function saveFile(saveAs = false) {
    if (!doc.writable || fileOperation.current) return
    fileOperation.current = true
    setBusy(true)
    try {
      let localSaveFailed = false
      const reportLocalFailure = (error: unknown) => {
        localSaveFailed = true
        report(error)
      }
      await doc.persist(true, saveAs ? 'Before Save As' : 'Manual save', false).catch(reportLocalFailure)
      const current = doc.current.current
      if (window.scripyDesktop) {
        const result = await window.scripyDesktop.saveDocument(
          serializeProject(current),
          scripyFileName(current.title),
          saveAs,
        )
        if (result?.saved) {
          setFileLocation(await window.scripyDesktop.getLocation(current.id))
          await doc.persist().catch(reportLocalFailure)
          if (!localSaveFailed) setOperationError('')
          setToast(
            localSaveFailed
              ? 'File saved. Local recovery still needs attention.'
              : 'Screenplay saved to disk.',
          )
        }
      } else {
        await download(serializeProject(current), scripyFileName(current.title), 'application/json')
        setToast('Document copy downloaded.')
      }
    } catch (error) {
      doc.failSave(error)
      report(error)
    } finally {
      fileOperation.current = false
      setBusy(false)
    }
  }
  async function openHistory() {
    showModal('history')
    setBusy(true)
    try {
      await doc.persist(false, 'Before viewing recovery', false).catch(report)
      setSnapshots(await listSnapshots(project.id))
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  async function openProjects() {
    showModal('projects')
    setBusy(true)
    try {
      await doc.persist(false, 'Before viewing projects', false).catch(report)
      setProjects(await listProjects())
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  async function goHome() {
    if (busy || fileOperation.current) return
    setBusy(true)
    try {
      await doc.persist(true, 'Before returning home')
      setMenuOpen(false)
      setToast('')
      setFocusMode(false)
      setMobileSidebar(false)
      setMobileNotes(false)
      closeFind()
      setHomeVisible(true)
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  async function saveDriveCopy() {
    if (!drive || !doc.writable || fileOperation.current) return
    fileOperation.current = true
    setBusy(true)
    setMenuOpen(false)
    const snapshot = doc.current.current
    try {
      await doc.persist(true, 'Before saving a Drive copy')
      await drive.saveCopy(snapshot)
      setOperationError('')
      setToast('Copy saved to Google Drive.')
    } catch (error) {
      report(error)
    } finally {
      fileOperation.current = false
      setBusy(false)
    }
  }
  async function openStoredProject(item: Screenplay) {
    if (!doc.writable) {
      if (item.id === doc.current.current.id) setHomeVisible(false)
      return
    }
    let warning = ''
    if (window.scripyDesktop) {
      let file: DesktopReopenResult | null = null
      try {
        file = await window.scripyDesktop.reopenDocument(item.id)
      } catch (error) {
        warning = `The disk file could not be reopened. Your local recovery draft is shown. ${error instanceof Error ? error.message : 'Use Open file or Save as to choose a location.'}`
      }
      if (file) {
        await importFile(file.content, file.name, file, item, file.changedOnDisk)
        return
      }
    }
    if (item.id !== doc.current.current.id) await switchTo(item)
    else {
      setModal(null)
      setHomeVisible(false)
    }
    if (warning) report(new Error(warning))
  }
  function goToScene(id: string) {
    setView('script')
    setMobileSidebar(false)
    requestAnimationFrame(() => editor.current?.goTo(id))
  }
  function addScene() {
    if (!doc.writable) return
    setView('script')
    setMobileSidebar(false)
    requestAnimationFrame(() => editor.current?.addScene())
  }
  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (artworkBusy || busy) return
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) {
      setOperationError('Enter a screenplay title.')
      return
    }
    setBusy(true)
    try {
      if (modal === 'new') {
        const next = createScreenplay(title)
        next.author = String(data.get('author') || '').trim()
        next.paperSize = detailsPaperSize
        next.titleArtwork = detailsArtwork
        serializeProject(next)
        await switchTo(next, 'New screenplay')
      } else {
        const updated = {
          ...doc.current.current,
          title,
          author: String(data.get('author') || '').trim(),
          draft: String(data.get('draft') || '').trim() || 'First draft',
          logline: String(data.get('logline') || '').trim(),
          paperSize: detailsPaperSize,
          titleArtwork: detailsArtwork,
        }
        serializeProject(updated)
        doc.update(() => updated)
        setModal(null)
      }
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  async function exportDocument() {
    if (fileOperation.current) return
    fileOperation.current = true
    setBusy(true)
    setToast('')
    setOperationError('')
    try {
      const current = doc.current.current
      let saved = false
      if (format === 'pdf') {
        saved = await download(
          await exportPdf(current, titlePage, preferences.sceneNumbers),
          `${fileName(current.title)}.pdf`,
          'application/pdf',
        )
      } else if (format === 'fountain')
        saved = await download(
          exportFountain(current),
          `${fileName(current.title)}.fountain`,
          'text/plain;charset=utf-8',
        )
      else
        saved = await download(
          serializeProject(current),
          scripyFileName(current.title, exportDate),
          'application/json',
        )
      if (saved) {
        setModal(null)
        setToast(`${format === 'pdf' ? 'PDF' : 'Document'} exported.`)
      }
    } catch (error) {
      report(error)
    } finally {
      fileOperation.current = false
      setBusy(false)
    }
  }

  async function saveRecoveryCopy() {
    try {
      const current = doc.current.current
      const saved = await download(
        serializeProject(current),
        scripyFileName(current.title),
        'application/json',
      )
      if (saved) {
        setOperationError('')
        setToast('Document copy saved.')
      }
    } catch (error) {
      report(error)
    }
  }

  const notices: Notice[] = []
  if (activeError && activeError !== dismissedError)
    notices.push({
      id: 'workspace-error',
      message: activeError,
      tone: !doc.writable && !doc.error ? 'info' : 'error',
      dismissLabel: fullscreen.error ? 'Dismiss fullscreen error' : 'Dismiss error',
      dismiss: () => {
        setDismissedError(activeError)
        setOperationError('')
        if (fullscreen.error) fullscreen.clearError()
      },
      action: doc.error
        ? { label: 'Retry save', run: () => void doc.persist().catch(report) }
        : modal === 'export'
          ? { label: 'Save document copy', run: () => void saveRecoveryCopy() }
          : undefined,
    })
  if (toast)
    notices.push({ id: 'workspace-status', message: toast, tone: 'success', dismiss: () => setToast('') })

  return (
    <div
      className={`app ${focusMode ? 'focus-mode' : ''} ${homeVisible ? 'home-open' : ''}`}
      style={
        {
          '--navigation-width': `${sidebarSizes.navigation.width}px`,
          '--notes-width': `${sidebarSizes.notes.width}px`,
        } as CSSProperties
      }
    >
      {homeVisible && (
        <HomePage
          appearance={appearance}
          activeId={doc.hasDocument ? project.id : undefined}
          projects={
            doc.hasDocument
              ? [project, ...projects.filter((item) => item.id !== project.id)].sort((first, second) =>
                  second.updatedAt.localeCompare(first.updatedAt),
                )
              : projects
          }
          busy={busy}
          loading={homeLoading}
          writable={doc.writable}
          error={homeError}
          notices={notices}
          modalOpen={modal !== null}
          onNew={() => showModal('new')}
          onOpen={() => void openFile()}
          onSelect={(item) => {
            setBusy(true)
            void openStoredProject(item)
              .catch(report)
              .finally(() => setBusy(false))
          }}
          onRetry={() => setHomeAttempt((value) => value + 1)}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".scripy,.json,.fountain,.txt"
        aria-label="Open screenplay file"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          try {
            if (file.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 5 MB document limit.')
            let text: string
            try {
              text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
            } catch {
              throw new Error(
                'This screenplay is not valid UTF-8 text. Convert its encoding before opening it.',
              )
            }
            await importFile(text, file.name)
          } catch (error) {
            report(error)
          }
        }}
      />
      <header className="app-header" hidden={homeVisible}>
        <div className="brand">
          <Brand />
        </div>
        <div className="header-document">
          <button
            className="breadcrumb"
            onClick={() => void (CLOUD_FEATURES_ENABLED ? openProjects() : goHome())}
            disabled={busy}
          >
            {CLOUD_FEATURES_ENABLED ? 'Workspace' : 'Home'}
          </button>
          <ChevronRight size={14} />
          <div className="document-menu-anchor">
            <button
              className="document-menu-button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label="Document menu"
            >
              <span>{project.title}</span>
              <ChevronDown size={13} />
            </button>
            {menuOpen && (
              <>
                <button
                  className="menu-dismiss"
                  aria-label="Close document menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="document-menu" role="menu">
                  <button role="menuitem" onClick={() => showModal('new')} disabled={!doc.writable}>
                    <FilePlus2 size={16} />
                    New screenplay
                  </button>
                  <button role="menuitem" onClick={() => void openFile()} disabled={!doc.writable}>
                    <Upload size={16} />
                    Import...
                  </button>
                  <button role="menuitem" onClick={() => void openProjects()}>
                    <LayoutGrid size={16} />
                    My screenplays
                  </button>
                  <div className="menu-rule" />
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      void (window.scripyDesktop ? saveFile() : saveChanges())
                    }}
                    disabled={!doc.writable}
                  >
                    <Save size={16} />
                    Save document
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      void saveFile(true)
                    }}
                    disabled={!doc.writable || busy}
                  >
                    {window.scripyDesktop ? <FilePlus2 size={16} /> : <Download size={16} />}
                    {window.scripyDesktop ? 'Save as...' : 'Download copy'}
                  </button>
                  {drive && (
                    <>
                      <button
                        role="menuitem"
                        disabled={busy || !doc.writable}
                        onClick={() => void saveDriveCopy()}
                      >
                        <CloudUpload size={16} />
                        Save copy to Google Drive
                      </button>
                      <button
                        role="menuitem"
                        disabled={busy || !doc.writable}
                        onClick={() => showModal('drive')}
                      >
                        <CloudDownload size={16} />
                        Open from Google Drive
                      </button>
                    </>
                  )}
                  {fileLocation && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        void window.scripyDesktop?.revealDocument(project.id).catch(report)
                      }}
                    >
                      <FolderOpen size={16} />
                      Show in folder
                    </button>
                  )}
                  <button role="menuitem" onClick={() => showModal('details')} disabled={!doc.writable}>
                    <Settings2 size={16} />
                    Document details
                  </button>
                  {!window.scripyDesktop && (
                    <>
                      <div className="menu-rule" />
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          if (DESKTOP_APP_URL) window.open(DESKTOP_APP_URL, '_blank', 'noopener,noreferrer')
                          else setToast('The desktop build link is coming soon.')
                        }}
                      >
                        <HardDrive size={16} />
                        Download local app
                      </button>
                      {session && (
                        <button
                          role="menuitem"
                          disabled={busy}
                          title={session.user.email}
                          onClick={async () => {
                            try {
                              await doc.persist(true, 'Before signing out')
                              onSignOut?.()
                            } catch (error) {
                              report(error)
                            }
                          }}
                        >
                          <LogOut size={16} />
                          Sign out
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <span className="draft-tag">{project.draft}</span>
        </div>
        <div className="header-actions">
          <span
            className={`save-indicator status-${doc.status}`}
            title={doc.error || 'Autosave is on. Ctrl/Cmd+S saves immediately.'}
          >
            {doc.status === 'saving' ? (
              <LoaderCircle className="spin" size={14} />
            ) : doc.status === 'saved' ? (
              <CheckCheck size={15} />
            ) : (
              <span className="status-dot" />
            )}
            <span>
              {doc.status === 'saved'
                ? window.scripyDesktop
                  ? fileLocation
                    ? 'Saved to file'
                    : 'Recovery saved'
                  : session
                    ? 'Saved locally'
                    : 'All changes saved'
                : doc.status === 'saving'
                  ? 'Saving...'
                  : doc.status === 'error'
                    ? 'Save failed'
                    : 'Unsaved changes'}
            </span>
          </span>
          <span className="toolbar-divider desktop-only" />
          <IconButton icon={History} label="Recovery history" onClick={() => void openHistory()} />
          <button className="button primary export-button" onClick={() => showModal('export')}>
            <Download size={15} />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className={`workspace ${mobileNotes ? 'mobile-notes-visible' : ''}`} hidden={homeVisible}>
        {mobileSidebar && (
          <button
            className="sidebar-backdrop"
            aria-label="Dismiss navigation"
            onClick={() => setMobileSidebar(false)}
          />
        )}
        {mobileNotes && (
          <button
            className="sidebar-backdrop"
            aria-label="Dismiss scene notes"
            onClick={() => setMobileNotes(false)}
          />
        )}
        <aside
          id="navigation-panel"
          className={`sidebar ${mobileSidebar ? 'mobile-open' : ''}`}
          aria-label="Screenplay navigation"
          hidden={panels.viewport > 800 && panels.layout.navigationCollapsed}
        >
          <div className="sidebar-heading">
            <span>Screenplay</span>
            {panels.viewport <= 800 && (
              <IconButton
                icon={PanelLeftClose}
                label="Close navigation"
                onClick={() => setMobileSidebar(false)}
              />
            )}
          </div>
          <div className="sidebar-scroll">
            <div className="project-heading">
              <div className="eyebrow">
                <Film size={12} /> SCREENPLAY{' '}
                <IconButton
                  icon={MoreHorizontal}
                  label="Edit document details"
                  onClick={() => showModal('details')}
                  disabled={!doc.writable}
                />
              </div>
              <button className="project-title" onClick={() => showModal('details')} disabled={!doc.writable}>
                {project.title}
              </button>
              <div className="project-subtitle">
                {project.draft}
                <span />
                {layout.pageCount} pages
              </div>
            </div>
            <div className="sidebar-tabs" role="tablist" aria-label="Navigation type">
              <button
                role="tab"
                aria-selected={sidebarTab === 'scenes'}
                className={sidebarTab === 'scenes' ? 'selected' : ''}
                onClick={() => setSidebarTab('scenes')}
              >
                <List size={15} />
                Scenes
              </button>
              <button
                role="tab"
                aria-selected={sidebarTab === 'characters'}
                className={sidebarTab === 'characters' ? 'selected' : ''}
                onClick={() => setSidebarTab('characters')}
              >
                <Users size={15} />
                Characters
              </button>
            </div>
            <div className="sidebar-search">
              <Search size={14} />
              <input
                aria-label={sidebarTab === 'scenes' ? 'Filter scenes' : 'Filter characters'}
                placeholder={sidebarTab === 'scenes' ? 'Find a scene...' : 'Find a character...'}
                value={sceneFilter}
                onChange={(event) => setSceneFilter(event.target.value)}
              />
            </div>
            <div className="section-label">
              <span>
                {sidebarTab === 'scenes' ? `${scenes.length} SCENES` : `${characters.length} CHARACTERS`}
              </span>
              {sidebarTab === 'scenes' && (
                <IconButton icon={Plus} label="Add scene" onClick={addScene} disabled={!doc.writable} />
              )}
            </div>
            <div className="navigation-list">
              {sidebarTab === 'scenes'
                ? filteredScenes.map((scene) => (
                    <button
                      className={`scene-row ${scene.id === activeScene?.id ? 'selected' : ''}`}
                      key={scene.id}
                      onClick={() => goToScene(scene.id)}
                      title={scene.heading}
                      aria-current={scene.id === activeScene?.id ? 'location' : undefined}
                    >
                      <span className="scene-index">{String(scene.number).padStart(2, '0')}</span>
                      <span className="scene-row-copy">
                        <span className="scene-location">{scene.location}</span>
                        <span className="scene-time">
                          {scene.time || 'Unspecified'}
                          <span className="scene-page">p. {layout.blockPages.get(scene.id) ?? 1}</span>
                        </span>
                      </span>
                      <span className="scene-active-dot" />
                    </button>
                  ))
                : characters
                    .filter((character) => character.name.toLowerCase().includes(sceneFilter.toLowerCase()))
                    .map((character, index) => (
                      <button
                        className="character-row"
                        key={character.name}
                        onClick={() => {
                          const block = project.blocks.find(
                            (item) => item.kind === 'character' && item.text.startsWith(character.name),
                          )
                          if (block) goToScene(block.id)
                        }}
                      >
                        <span className={`character-avatar avatar-${index % 4}`}>{character.name[0]}</span>
                        <span>
                          <strong>{character.name}</strong>
                          <small>
                            {character.cues} cues<span> / </span>
                            {character.words} words
                          </small>
                        </span>
                      </button>
                    ))}
              {sidebarTab === 'scenes' && !filteredScenes.length && (
                <p className="empty-label">{scenes.length ? 'No matching scenes.' : 'No scenes yet.'}</p>
              )}
              {sidebarTab === 'characters' && !characters.length && (
                <p className="empty-label">No characters yet.</p>
              )}
            </div>
            <div className="sidebar-bottom">
              <button
                className="new-document-button"
                disabled={!doc.writable}
                onClick={() => showModal('new')}
              >
                <Plus size={16} />
                New screenplay
              </button>
              <div className="local-workspace">
                <HardDrive size={15} />
                <span>Local workspace</span>
                <IconButton
                  icon={Settings2}
                  label="Editor preferences"
                  onClick={() => showModal('settings')}
                />
              </div>
            </div>
          </div>
          <SidebarResizeHandle
            side="navigation"
            bounds={sidebarSizes.navigation}
            defaultWidth={DEFAULT_PANEL_LAYOUT.navigationWidth}
            controls="navigation-panel"
            onResize={(navigationWidth) => panels.setLayout((previous) => ({ ...previous, navigationWidth }))}
          />
        </aside>

        <main className="main-panel">
          <div className="editor-controls">
            <div className="view-bar">
              <div className="view-bar-left">
                <IconButton
                  icon={navigationVisible ? PanelLeftClose : panels.viewport <= 800 ? Menu : PanelLeftOpen}
                  label={navigationVisible ? 'Hide navigation' : 'Open navigation'}
                  onClick={toggleNavigation}
                  active={navigationVisible}
                />
                <div className="view-tabs" role="tablist" aria-label="Document view">
                  <button
                    role="tab"
                    aria-selected={view === 'script'}
                    className={view === 'script' ? 'selected' : ''}
                    onClick={() => setView('script')}
                  >
                    <FileText size={16} />
                    Script
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === 'outline'}
                    className={view === 'outline' ? 'selected' : ''}
                    onClick={() => setView('outline')}
                  >
                    <LayoutGrid size={16} />
                    Outline
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === 'notes'}
                    className={view === 'notes' ? 'selected' : ''}
                    onClick={showNotesView}
                  >
                    <MessageSquare size={16} />
                    Notes
                  </button>
                </div>
              </div>
              <div className="view-actions">
                <IconButton
                  icon={fullscreen.active ? Minimize2 : Maximize2}
                  label={fullscreen.active ? 'Exit fullscreen' : 'Enter fullscreen'}
                  hint="F11"
                  active={fullscreen.active}
                  disabled={fullscreen.pending || !fullscreen.supported}
                  onClick={() => void fullscreen.toggle()}
                />
                <IconButton
                  icon={appearance.theme === 'dark' ? Sun : Moon}
                  label={appearance.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  hint="Alt+T"
                  onClick={toggleTheme}
                />
                <IconButton
                  icon={Focus}
                  label={focusMode ? 'Exit focus mode' : 'Focus mode'}
                  hint="Alt+F"
                  active={focusMode}
                  onClick={toggleFocus}
                />
                <IconButton
                  icon={notesVisible ? PanelRightClose : PanelRightOpen}
                  label={notesVisible ? 'Hide scene notes' : 'Show scene notes'}
                  active={notesVisible}
                  onClick={toggleNotes}
                />
              </div>
            </div>
            <div className="editor-toolbar" hidden={view === 'notes'}>
              <div className="element-selector">
                <Type size={15} />
                <select
                  aria-label="Screenplay element"
                  value={info.kind}
                  disabled={!doc.writable || view !== 'script'}
                  onChange={(event) => editor.current?.setKind(event.target.value as ElementKind)}
                >
                  {ELEMENTS.map((kind) => (
                    <option key={kind} value={kind}>
                      {ELEMENT_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="toolbar-divider" />
              <IconButton
                icon={Undo2}
                label="Undo"
                disabled={!doc.writable || !info.canUndo}
                onClick={() => editor.current?.undo()}
              />
              <IconButton
                icon={Redo2}
                label="Redo"
                disabled={!doc.writable || !info.canRedo}
                onClick={() => editor.current?.redo()}
              />
              <span className="toolbar-divider" />
              <IconButton
                icon={Search}
                label="Find and replace"
                active={findOpen}
                onClick={() => {
                  setView('script')
                  if (findOpen) closeFind()
                  else setFindOpen(true)
                }}
              />
              <IconButton
                icon={MessageSquarePlus}
                label="Add note"
                active={Boolean(info.passage)}
                disabled={!doc.writable || busy || !info.passage || view !== 'script'}
                onClick={() => editPassageNote()}
              />
              <span className="typeface-label">
                Courier Prime<span>12 pt</span>
              </span>
              <div className="toolbar-right">
                <label className="zoom-selector">
                  <Maximize2 size={14} />
                  <select
                    aria-label="Page zoom"
                    value={preferences.zoom}
                    onChange={(event) => setPreferences((value) => ({ ...value, zoom: event.target.value }))}
                  >
                    <option value="fit">Fit</option>
                    <option value="0.75">75%</option>
                    <option value="1">100%</option>
                    <option value="1.25">125%</option>
                  </select>
                </label>
                <button
                  className="paper-size"
                  title="Page setup"
                  onClick={() => showModal('details')}
                  disabled={!doc.writable}
                >
                  {PAPER_LABELS[project.paperSize]}
                </button>
              </div>
            </div>
          </div>
          {findOpen && (
            <div className="find-bar">
              <div className="find-fields">
                <label>
                  <Search size={14} />
                  <input
                    ref={findInput}
                    aria-label="Find text"
                    placeholder="Find in screenplay"
                    value={query}
                    maxLength={200}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        setMatchCount(editor.current?.search(query, event.shiftKey ? -1 : 1) ?? 0)
                      }
                    }}
                  />
                </label>
                <label>
                  <input
                    aria-label="Replace with"
                    placeholder="Replace with"
                    value={replacement}
                    maxLength={5000}
                    onChange={(event) => setReplacement(event.target.value)}
                  />
                </label>
              </div>
              <span className="match-count" aria-live="polite">
                {matchCount} matches
              </span>
              <IconButton
                icon={ArrowUp}
                label="Previous match"
                onClick={() => setMatchCount(editor.current?.search(query, -1) ?? 0)}
                disabled={!matchCount}
              />
              <IconButton
                icon={ArrowDown}
                label="Next match"
                onClick={() => setMatchCount(editor.current?.search(query) ?? 0)}
                disabled={!matchCount}
              />
              <button
                className="button small"
                disabled={!query || !doc.writable}
                onClick={() => {
                  editor.current?.replace(query, replacement, false)
                  setMatchCount(editor.current?.search(query) ?? 0)
                }}
              >
                Replace
              </button>
              <button
                className="button small"
                disabled={!query || !doc.writable}
                onClick={() => {
                  const count = editor.current?.replace(query, replacement, true) ?? 0
                  setMatchCount(editor.current?.search(query) ?? 0)
                  setToast(`Replaced ${count} matches.`)
                }}
              >
                All
              </button>
              <IconButton icon={X} label="Close find" onClick={closeFind} />
            </div>
          )}

          <div className="document-canvas" ref={canvas}>
            <NotesView
              key={project.id}
              active={view === 'notes'}
              project={project}
              scenes={scenes}
              canAdd={Boolean(info.passage)}
              onAdd={() => editPassageNote()}
              {...noteActions}
            />
            <div className="script-view" hidden={view !== 'script'}>
              <div className="canvas-caption" style={{ maxWidth: paper.width * zoom }}>
                <span>
                  <span className="draft-dot" />
                  {project.draft}
                </span>
                <span>SCREENPLAY</span>
              </div>
              <ScreenplayEditor
                annotations={project.annotations}
                ref={editor}
                documentKey={`${project.id}:${revision}:${doc.generation}`}
                paperSize={project.paperSize}
                initialBlocks={project.blocks}
                zoom={zoom}
                sceneNumbers={preferences.sceneNumbers}
                spellcheck={preferences.spellcheck}
                readOnly={!doc.writable || busy}
                onChange={doc.updateBlocks}
                onSelection={setInfo}
                onLayout={setLayout}
                onFind={() => setFindOpen(true)}
                onAddNote={() => editPassageNote()}
                onNoteClick={(id) => {
                  setActiveNoteId(id)
                  setPreferences((previous) => ({ ...previous, inspector: true }))
                  if (window.innerWidth <= 1100) setMobileNotes(true)
                }}
              />
              <div className="end-of-draft">
                <span />
                {layout.pageCount} {layout.pageCount === 1 ? 'page' : 'pages'}
                <span />
              </div>
            </div>
            {view === 'outline' && (
              <div className="outline-view">
                <div className="outline-heading">
                  <div>
                    <span className="eyebrow">THE BIG PICTURE</span>
                    <h1>Scene outline</h1>
                    <p>
                      {scenes.length} scenes <span>/</span> {totalWords.toLocaleString()} words
                    </p>
                  </div>
                  <button className="button" disabled={!doc.writable} onClick={addScene}>
                    <Plus size={16} />
                    Add scene
                  </button>
                </div>
                <div className="outline-grid">
                  {scenes.map((scene, index) => (
                    <article className="outline-card" key={scene.id}>
                      <div className="outline-card-top">
                        <span className="outline-number">{String(scene.number).padStart(2, '0')}</span>
                        <span className="scene-type">
                          {scene.location.startsWith('EXT') ? 'EXTERIOR' : 'INTERIOR'}
                        </span>
                        <span className="outline-time">
                          {scene.time.includes('NIGHT') || scene.time.includes('PRE-DAWN') ? (
                            <Moon size={13} />
                          ) : (
                            <Sun size={13} />
                          )}
                          {scene.time}
                        </span>
                      </div>
                      <button className="outline-scene-title" onClick={() => goToScene(scene.id)}>
                        {scene.location}
                      </button>
                      <p className="outline-preview">{scene.preview || 'Untitled scene'}</p>
                      {project.notes[scene.id] && (
                        <p className="outline-note">
                          <MessageSquare size={12} />
                          {project.notes[scene.id]}
                        </p>
                      )}
                      <div className="outline-card-bottom">
                        <span>
                          p. {layout.blockPages.get(scene.id) ?? 1} <span>/</span> {scene.words} words
                        </span>
                        <div>
                          <IconButton
                            icon={ArrowLeft}
                            label={`Move scene ${scene.number} earlier`}
                            disabled={index === 0 || !doc.writable}
                            onClick={() =>
                              editor.current?.replaceBlocks(
                                moveScene(doc.current.current, scene.id, -1).blocks,
                              )
                            }
                          />
                          <IconButton
                            icon={ArrowRight}
                            label={`Move scene ${scene.number} later`}
                            disabled={index === scenes.length - 1 || !doc.writable}
                            onClick={() =>
                              editor.current?.replaceBlocks(
                                moveScene(doc.current.current, scene.id, 1).blocks,
                              )
                            }
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {!scenes.length && (
                  <div className="empty-state">
                    <FileText size={32} />
                    <p>No scenes yet.</p>
                    <button className="button" onClick={addScene} disabled={!doc.writable}>
                      <Plus size={16} />
                      Add scene
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <aside id="notes-panel" className="inspector" aria-label="Scene notes" hidden={!notesVisible}>
          <div className="inspector-heading">
            <MessageSquare size={16} />
            <h2>Scene notes</h2>
            {panels.viewport <= 1100 && (
              <IconButton
                icon={PanelRightClose}
                label="Close scene notes"
                onClick={() => setPreferences((value) => ({ ...value, inspector: false }))}
              />
            )}
          </div>
          <div className="inspector-content">
            <section className="passage-panel" aria-label="Passage notes">
              <div className="passage-panel-heading">
                <h3>Passage notes</h3>
                <IconButton icon={List} label="Browse all passage notes" onClick={showNotesView} />
              </div>
              {info.passage && <blockquote className="selection-quote">{info.passage.quote}</blockquote>}
              <button
                className="button primary small new-passage-note"
                aria-label="Add passage note"
                disabled={
                  !doc.writable ||
                  busy ||
                  (!info.passage &&
                    !project.blocks.find((block) => block.id === activeScene?.id)?.text.trim())
                }
                onClick={() => editPassageNote()}
              >
                <MessageSquarePlus size={15} />
                Add note
              </button>
              <PassageNoteList
                notes={project.annotations.filter(
                  (note) =>
                    note.id === activeNoteId ||
                    note.ranges.some((range) => noteSceneBlocks.has(range.blockId)),
                )}
                project={project}
                scenes={scenes}
                activeId={activeNoteId}
                {...noteActions}
              />
            </section>
            {activeScene ? (
              <>
                <div className="scene-detail-eyebrow">
                  <span>SCENE {String(activeScene.number).padStart(2, '0')}</span>
                  <span>p. {layout.blockPages.get(activeScene.id) ?? 1}</span>
                </div>
                <h3>{activeScene.location}</h3>
                <div className="scene-details-line">
                  {activeScene.time.includes('NIGHT') || activeScene.time.includes('PRE-DAWN') ? (
                    <Moon size={13} />
                  ) : (
                    <Sun size={13} />
                  )}
                  <span>{activeScene.time || 'Unspecified'}</span>
                  <span className="detail-separator" />
                  <span>{activeScene.words} words</span>
                </div>
                <div className="notes-area">
                  <div className="scene-memo-heading">
                    <label htmlFor="scene-notes">SCENE MEMO</label>
                    <span aria-live="polite">
                      {doc.status === 'saved'
                        ? 'Saved'
                        : doc.status === 'error'
                          ? 'Save failed'
                          : 'Saving...'}
                    </span>
                  </div>
                  <SceneMemoField
                    key={`${project.id}:${activeScene.id}:${revision}:${doc.generation}`}
                    value={project.notes[activeScene.id] ?? ''}
                    disabled={!doc.writable}
                    onSave={() => void saveSceneMemo()}
                    onChange={(note) =>
                      doc.update(
                        (previous) => ({
                          ...previous,
                          notes: { ...previous.notes, [activeScene.id]: note },
                        }),
                        { immediate: true },
                      )
                    }
                  />
                  <div className="scene-memo-actions">
                    <button
                      className="button small"
                      disabled={!doc.writable || busy}
                      onClick={() => void saveSceneMemo()}
                    >
                      <Save size={14} />
                      Save memo
                    </button>
                    <button
                      className="button small"
                      disabled={
                        !doc.writable ||
                        busy ||
                        !project.notes[activeScene.id]?.trim() ||
                        (!info.passage &&
                          !project.blocks.find((block) => block.id === activeScene.id)?.text.trim())
                      }
                      onClick={() => editPassageNote(null, project.notes[activeScene.id] ?? '')}
                    >
                      <Users size={14} />
                      Departments &amp; tags
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-label">No scene selected.</p>
            )}
            <div className="inspector-rule" />
            <div className="overview-heading">
              <span className="eyebrow">SCRIPT OVERVIEW</span>
              <IconButton
                icon={Settings2}
                label="Edit screenplay information"
                onClick={() => showModal('details')}
                disabled={!doc.writable}
              />
            </div>
            <dl className="script-stats">
              <div>
                <dt>Scenes</dt>
                <dd>{scenes.length}</dd>
              </div>
              <div>
                <dt>Characters</dt>
                <dd>{characters.length}</dd>
              </div>
              <div>
                <dt>Word count</dt>
                <dd>{totalWords.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Est. runtime</dt>
                <dd>~{layout.pageCount} min</dd>
              </div>
            </dl>
            {project.logline && (
              <div className="logline-section">
                <span className="eyebrow">LOGLINE</span>
                <p>{project.logline}</p>
              </div>
            )}
            {project.title === 'The Quiet Hours' && (
              <figure className="reference-photo">
                <img
                  src={`${import.meta.env.BASE_URL}images/quiet-city.jpg`}
                  alt="A quiet city street in the soft morning light"
                />
                <figcaption>
                  <span>THE QUIET HOURS</span>
                  <span>Visual reference</span>
                </figcaption>
              </figure>
            )}
          </div>
          <div className="inspector-footer">
            <ShieldCheck size={14} />
            {window.scripyDesktop ? 'On your device' : 'Stored in this browser'}
          </div>
          <SidebarResizeHandle
            side="notes"
            bounds={sidebarSizes.notes}
            defaultWidth={DEFAULT_PANEL_LAYOUT.notesWidth}
            controls="notes-panel"
            onResize={(notesWidth) => panels.setLayout((previous) => ({ ...previous, notesWidth }))}
          />
        </aside>
      </div>

      <footer className="status-bar">
        <div>
          <span className={`connection-dot ${doc.status === 'error' ? 'warning' : ''}`} />
          <span>{doc.writable ? 'Local draft' : 'Read only'}</span>
          <span className="status-separator" />
          {fileLocation ? (
            <button
              className="status-filename file-location"
              title={fileLocation.path}
              aria-label={`Show file in folder: ${fileLocation.path}`}
              onClick={() => void window.scripyDesktop?.revealDocument(project.id).catch(report)}
            >
              {fileLocation.path}
            </button>
          ) : (
            <span className="status-filename">
              {window.scripyDesktop ? 'Not yet saved to a file' : `${fileName(project.title)}.scripy`}
            </span>
          )}
        </div>
        <div>
          <span>{totalWords.toLocaleString()} words</span>
          <span className="status-separator" />
          <span>
            Page <strong>{info.page}</strong> of {layout.pageCount}
          </span>
          <span className="status-separator desktop-only" />
          <span className="desktop-only">{ELEMENT_LABELS[info.kind]}</span>
        </div>
      </footer>
      {focusMode && (
        <button className="exit-focus button" onClick={() => setFocusMode(false)}>
          <PanelLeftClose size={16} />
          Exit focus
        </button>
      )}
      {!homeVisible && <FloatingNotifications notices={notices} />}

      {modal === 'note' && noteDraft && (
        <PassageNoteForm
          key={noteDraft.id}
          note={noteDraft.note}
          initialText={noteDraft.initialText}
          selection={noteDraft.selection}
          alternateSelection={info.passage}
          tags={[...new Set(project.annotations.flatMap((note) => note.tags))]}
          departments={[...new Set(project.annotations.flatMap((note) => note.departments))]}
          disabled={!doc.writable || busy}
          saving={busy}
          onSave={savePassageNote}
          onClose={() => {
            if (busy) return
            setModal(null)
            setNoteDraft(null)
          }}
        />
      )}

      {(modal === 'new' || modal === 'details') && (
        <Dialog
          title={modal === 'new' ? 'A new screenplay' : 'Screenplay details'}
          className="dialog-details"
          onClose={() => {
            if (!busy && !artworkBusy) setModal(null)
          }}
        >
          <form className="details-form" onSubmit={(event) => void submitDetails(event)}>
            <div className="details-content">
              <div className="details-fields">
                <label className="field-label">
                  Title
                  <input
                    name="title"
                    required
                    maxLength={300}
                    autoFocus
                    placeholder="Untitled screenplay"
                    value={detailsTitle}
                    onChange={(event) => setDetailsTitle(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Written by
                  <input
                    name="author"
                    maxLength={300}
                    placeholder="Author name"
                    value={detailsAuthor}
                    onChange={(event) => setDetailsAuthor(event.target.value)}
                  />
                </label>
                <div className="details-options">
                  {modal === 'details' && (
                    <label className="field-label">
                      Draft
                      <input name="draft" maxLength={100} defaultValue={project.draft} />
                    </label>
                  )}
                  <label className="field-label">
                    Paper size
                    <select
                      aria-label="Paper size"
                      value={detailsPaperSize}
                      onChange={(event) => setDetailsPaperSize(event.target.value as PaperSize)}
                      disabled={busy || artworkBusy}
                    >
                      {PAPER_SIZES.map((size) => (
                        <option value={size} key={size}>
                          {PAPER_LABELS[size]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {modal === 'details' && (
                  <label className="field-label">
                    Logline
                    <textarea name="logline" maxLength={5000} rows={4} defaultValue={project.logline} />
                  </label>
                )}
              </div>
              <TitleArtworkEditor
                artwork={detailsArtwork}
                title={detailsTitle}
                author={detailsAuthor}
                paperSize={detailsPaperSize}
                disabled={busy || !doc.writable}
                onChange={setDetailsArtwork}
                onBusyChange={setArtworkBusy}
              />
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button"
                disabled={busy || artworkBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || artworkBusy || !doc.writable}
              >
                {busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : modal === 'new' ? (
                  <Plus size={15} />
                ) : (
                  <Save size={15} />
                )}
                {modal === 'new' ? 'Create screenplay' : 'Save details'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === 'export' && (
        <Dialog
          title="Export screenplay"
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <div className="export-document">
            <span className="export-file-icon">
              <FileText size={26} />
            </span>
            <div>
              <strong>{project.title}</strong>
              <span>
                {layout.pageCount} pages <span>/</span> {project.draft}
              </span>
            </div>
          </div>
          <span className="field-heading">FORMAT</span>
          <div className="format-options" role="radiogroup" aria-label="Export format">
            {(
              [
                { value: 'pdf', label: 'PDF', icon: FileText },
                { value: 'fountain', label: 'Fountain', icon: Type },
                { value: 'scripy', label: 'Scripy', icon: FileJson },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={format === option.value}
                className={format === option.value ? 'selected' : ''}
                onClick={() => setFormat(option.value)}
              >
                <option.icon size={20} />
                <span>{option.label}</span>
                {format === option.value && <Check size={12} className="format-check" />}
              </button>
            ))}
          </div>
          {format === 'pdf' && (
            <div className="export-options">
              <label className="field-label export-paper-size">
                Paper size
                <select
                  aria-label="Paper size"
                  value={project.paperSize}
                  disabled={busy || !doc.writable}
                  onChange={(event) => {
                    const paperSize = event.target.value as PaperSize
                    doc.update((previous) => ({ ...previous, paperSize }))
                  }}
                >
                  {PAPER_SIZES.map((size) => (
                    <option value={size} key={size}>
                      {PAPER_LABELS[size]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={titlePage}
                  onChange={(event) => setTitlePage(event.target.checked)}
                />
                Include title page
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.sceneNumbers}
                  onChange={(event) =>
                    setPreferences((value) => ({ ...value, sceneNumbers: event.target.checked }))
                  }
                />
                Scene numbers
              </label>
              <div className="export-spec">
                <span>{PAPER_LABELS[project.paperSize]}</span>
                <span>Courier Prime, 12 pt</span>
              </div>
              {titlePage && (
                <div className="export-title-artwork">
                  {project.titleArtwork && <img src={project.titleArtwork.dataUrl} alt="Title-page image" />}
                  <button
                    type="button"
                    className="button small"
                    disabled={busy || !doc.writable}
                    onClick={() => showModal('details')}
                  >
                    <Settings2 size={14} />
                    {project.titleArtwork ? 'Edit title page' : 'Add title image'}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="export-filename">
            <FileText size={14} />
            <span>
              {format === 'scripy'
                ? scripyFileName(project.title, exportDate)
                : `${fileName(project.title)}.${format}`}
            </span>
          </div>
          <div className="dialog-actions">
            <button className="button" disabled={busy} onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="button primary" disabled={busy} onClick={() => void exportDocument()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
              {busy ? 'Exporting...' : `Export ${format === 'pdf' ? 'PDF' : 'document'}`}
            </button>
          </div>
        </Dialog>
      )}

      {modal === 'history' && (
        <Dialog
          title="Recovery history"
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <div className="history-header">
            <span>{project.title}</span>
            <button
              className="button small"
              disabled={busy || !doc.writable}
              onClick={async () => {
                setBusy(true)
                try {
                  await doc.persist(true, 'Manual snapshot', false)
                  setSnapshots(await listSnapshots(project.id))
                  setToast('Snapshot created.')
                } catch (error) {
                  report(error)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Plus size={14} />
              Snapshot
            </button>
          </div>
          {busy && (
            <div className="loading-inline">
              <LoaderCircle className="spin" size={18} />
            </div>
          )}
          <div className="snapshot-list">
            {snapshots.map((snapshot) => (
              <div className="snapshot-row" key={snapshot.id}>
                <span className="snapshot-icon">
                  <History size={17} />
                </span>
                <div>
                  <strong>{snapshot.label}</strong>
                  <span>{friendlyDate(snapshot.savedAt)}</span>
                  <small>
                    {snapshot.project.blocks.reduce((total, block) => total + wordCount(block.text), 0)} words
                  </small>
                </div>
                <button
                  className={`button small ${confirmSnapshot === snapshot.id ? 'primary' : ''}`}
                  disabled={busy || !doc.writable}
                  onClick={async () => {
                    if (confirmSnapshot !== snapshot.id) {
                      setConfirmSnapshot(snapshot.id)
                      return
                    }
                    setBusy(true)
                    try {
                      await doc.persist(true, 'Before recovery')
                      await switchTo(
                        { ...snapshot.project, updatedAt: new Date().toISOString() },
                        'Recovered snapshot',
                      )
                      setToast('Snapshot restored. Previous draft retained in history.')
                    } catch (error) {
                      report(error)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {confirmSnapshot === snapshot.id ? 'Confirm restore' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
          {!busy && !snapshots.length && <p className="empty-label">No recovery snapshots yet.</p>}
        </Dialog>
      )}

      {modal === 'drive' && drive && (
        <DriveFilesDialog
          drive={drive}
          onClose={() => setModal(null)}
          onOpen={async (next, name) => {
            await switchTo(next, 'Opened from Google Drive')
            setOperationError('')
            setToast(`Opened ${name} from Google Drive.`)
          }}
        />
      )}

      {modal === 'projects' && (
        <Dialog
          title="My screenplays"
          wide
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <div className="projects-heading">
            <span>
              <HardDrive size={14} />
              Local workspace
            </span>
            <button
              className="button primary small"
              disabled={!doc.writable}
              onClick={() => showModal('new')}
            >
              <Plus size={14} />
              New screenplay
            </button>
          </div>
          {busy && (
            <div className="loading-inline">
              <LoaderCircle className="spin" size={18} />
            </div>
          )}
          <div className="project-list">
            {projects.map((item) => (
              <button
                className="project-list-item"
                disabled={busy || !doc.writable}
                key={item.id}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await openStoredProject(item)
                  } catch (error) {
                    report(error)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <span className="project-list-icon">
                  <FileText size={22} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.draft}
                    <span> / </span>
                    {friendlyDate(item.updatedAt)}
                  </small>
                </span>
                {item.id === project.id ? (
                  <span className="current-project">Open</span>
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ))}
          </div>
          <button
            className="button open-file-button"
            disabled={!doc.writable}
            onClick={() => void openFile()}
          >
            <FolderOpen size={16} />
            Open a file
          </button>
        </Dialog>
      )}

      {modal === 'settings' && (
        <Dialog title="Editor preferences" onClose={() => setModal(null)}>
          <fieldset className="appearance-fieldset">
            <legend>Appearance</legend>
            <div className="appearance-options">
              {(
                [
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'system', label: 'System', icon: Monitor },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`appearance-option ${appearance.preference === option.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={option.value}
                    checked={appearance.preference === option.value}
                    onChange={() => {
                      if (!appearance.chooseTheme(option.value))
                        setToast('Appearance changed, but the preference could not be saved.')
                    }}
                  />
                  <option.icon size={16} strokeWidth={1.7} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="preference-row">
            <span>
              <Type size={17} />
              Spellcheck
            </span>
            <label className="toggle">
              <input
                aria-label="Spellcheck"
                type="checkbox"
                checked={preferences.spellcheck}
                onChange={(event) =>
                  setPreferences((value) => ({ ...value, spellcheck: event.target.checked }))
                }
              />
              <span />
            </label>
          </div>
          <div className="preference-row">
            <span>
              <List size={17} />
              Scene numbers
            </span>
            <label className="toggle">
              <input
                aria-label="Show scene numbers"
                type="checkbox"
                checked={preferences.sceneNumbers}
                onChange={(event) =>
                  setPreferences((value) => ({ ...value, sceneNumbers: event.target.checked }))
                }
              />
              <span />
            </label>
          </div>
          <div className="preference-row">
            <span>
              <MessageSquare size={17} />
              Scene notes panel
            </span>
            <label className="toggle">
              <input
                aria-label="Show scene notes panel"
                type="checkbox"
                checked={preferences.inspector}
                onChange={(event) =>
                  setPreferences((value) => ({ ...value, inspector: event.target.checked }))
                }
              />
              <span />
            </label>
          </div>
          <div className="preferences-footer">
            <Brand />
            <span>{appVersion}</span>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function WorkspaceBoot({
  appearance,
  storage,
  session,
  onSignOut,
  drive,
}: {
  appearance: Appearance
  storage: DocumentStorage
  session?: GoogleSession
  onSignOut?: () => void
  drive?: GoogleDrive
}) {
  const [project, setProject] = useState<StartupDocument | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const boot = useRef<Promise<StartupDocument> | null>(null)
  useEffect(() => {
    let active = true
    boot.current ??= initialDocument(storage)
    void boot.current
      .then((value) => {
        if (active) {
          setProject(value)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Local storage could not be opened.')
      })
    return () => {
      active = false
    }
  }, [attempt, storage])
  if (project)
    return (
      <Workspace
        initial={project.project}
        hasInitialDocument={project.hasDocument}
        warning={project.warning}
        recovered={project.recovered}
        appearance={appearance}
        storage={storage}
        session={session}
        onSignOut={onSignOut}
        drive={drive}
      />
    )
  return (
    <div className="boot-screen">
      <h1>
        <Brand />
      </h1>
      {error ? (
        <>
          <FloatingNotifications
            notices={[{ id: 'startup-error', message: error, tone: 'error', dismiss: () => setError('') }]}
          />
          <button
            className="button primary"
            onClick={() => {
              setError('')
              boot.current = null
              setAttempt((value) => value + 1)
            }}
          >
            Retry opening workspace
          </button>
        </>
      ) : (
        <LoaderCircle className="spin" size={20} aria-label="Opening screenplay" />
      )}
    </div>
  )
}

function AccountWorkspace({
  appearance,
  session,
  onSignOut,
  onExpired,
}: {
  appearance: Appearance
  session: GoogleSession
  onSignOut: () => void
  onExpired: () => void
}) {
  const [storage] = useState(() => createDocumentStorage(session.user.id))
  const [drive] = useState(() => createGoogleDrive(session, onExpired))
  return (
    <WorkspaceBoot
      appearance={appearance}
      storage={storage}
      session={session}
      onSignOut={onSignOut}
      drive={drive}
    />
  )
}

export default function App() {
  const appearance = useTheme()
  if (!CLOUD_FEATURES_ENABLED || window.scripyDesktop)
    return <WorkspaceBoot appearance={appearance} storage={localDocumentStorage} />
  return (
    <BrowserSession appearance={appearance}>
      {(session, signOut, expire) => (
        <AccountWorkspace
          key={session.user.id}
          appearance={appearance}
          session={session}
          onSignOut={signOut}
          onExpired={expire}
        />
      )}
    </BrowserSession>
  )
}
