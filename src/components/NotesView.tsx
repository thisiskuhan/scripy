import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { ChevronDown, Filter, MessageSquare, MessageSquarePlus, RotateCcw, Search, Tag } from 'lucide-react'
import { DEPARTMENTS, filterPassageNotes, type Department, type NoteFilters } from '../lib/annotations'
import type { Scene, Screenplay } from '../lib/screenplay'
import { PassageNoteList, type NoteActions } from './PassageNoteList'

function MultiFilter({
  label,
  options,
  values,
  onChange,
  icon: Icon,
}: {
  label: string
  options: readonly string[]
  values: string[]
  onChange(values: string[]): void
  icon: typeof Filter
}) {
  const element = useRef<HTMLDetailsElement>(null)
  const menu = useRef<HTMLFieldSetElement>(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const reference = element.current?.querySelector('summary')
    const floating = menu.current
    if (!open || !reference || !floating) return
    let active = true
    const supportsPopover = typeof floating.showPopover === 'function'
    floating.style.visibility = 'hidden'
    if (supportsPopover) {
      floating.setAttribute('popover', 'manual')
      floating.showPopover()
    }
    const cleanup = autoUpdate(reference, floating, () => {
      void computePosition(reference, floating, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
          offset(8),
          flip({ padding: 12, boundary: [] }),
          shift({ padding: 12, boundary: [] }),
          size({
            padding: 12,
            boundary: [],
            apply({ availableHeight, elements }) {
              elements.floating.style.maxHeight = `${Math.max(0, Math.min(280, availableHeight))}px`
            },
          }),
        ],
      }).then(({ x: left, y: top }) => {
        if (active)
          Object.assign(floating.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' })
      })
    })
    return () => {
      active = false
      cleanup()
      if (supportsPopover && floating.isConnected && floating.matches(':popover-open')) floating.hidePopover()
    }
  }, [open])
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.current?.contains(event.target))
        element.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <details
      className="note-filter"
      ref={element}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          element.current?.removeAttribute('open')
          element.current?.querySelector('summary')?.focus()
        }
      }}
    >
      <summary aria-label={`Filter ${label.toLowerCase()}`}>
        <Icon size={14} />
        <span>
          {label}
          {values.length ? ` (${values.length})` : ''}
        </span>
        <ChevronDown size={13} />
      </summary>
      <fieldset className="note-filter-options" ref={menu}>
        <legend>{label}</legend>
        {options.length ? (
          options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={values.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...values, option] : values.filter((value) => value !== option),
                  )
                }
              />
              {option}
            </label>
          ))
        ) : (
          <span>No tags yet.</span>
        )}
      </fieldset>
    </details>
  )
}

const initialFilters: NoteFilters = {
  query: '',
  departments: [],
  tags: [],
  status: 'all',
  sceneId: '',
  sort: 'recent',
}

export function NotesView({
  project,
  scenes,
  active,
  canAdd,
  onAdd,
  ...actions
}: NoteActions & { project: Screenplay; scenes: Scene[]; active: boolean; canAdd: boolean; onAdd(): void }) {
  const [filters, setFilters] = useState(initialFilters)
  const deferredQuery = useDeferredValue(filters.query)
  if (!active) return null
  const notes = filterPassageNotes(project.annotations, project.blocks, scenes, {
    ...filters,
    query: deferredQuery,
  })
  const tags = [...new Set(project.annotations.flatMap((note) => note.tags))].sort()
  const departmentOptions = [
    ...new Set([...DEPARTMENTS, ...project.annotations.flatMap((note) => note.departments)]),
  ]
  const filtered =
    filters.query ||
    filters.departments.length ||
    filters.tags.length ||
    filters.status !== 'all' ||
    filters.sceneId
  return (
    <section className="notes-workspace" aria-label="Screenplay notes">
      <div className="notes-heading">
        <div>
          <h1>
            Notes <span>{project.annotations.length}</span>
          </h1>
          <p>{project.title}</p>
        </div>
        <button className="button primary small" disabled={actions.disabled || !canAdd} onClick={onAdd}>
          <MessageSquarePlus size={15} />
          Add note
        </button>
      </div>
      <div className="notes-filters">
        <label className="notes-search">
          <Search size={15} />
          <input
            aria-label="Search notes"
            placeholder="Search notes"
            value={filters.query}
            maxLength={300}
            onChange={(event) => setFilters((previous) => ({ ...previous, query: event.target.value }))}
          />
        </label>
        <MultiFilter
          label="Departments"
          options={departmentOptions}
          values={filters.departments}
          onChange={(departments) =>
            setFilters((previous) => ({ ...previous, departments: departments as Department[] }))
          }
          icon={Filter}
        />
        <MultiFilter
          label="Tags"
          options={tags}
          values={filters.tags}
          onChange={(selected) => setFilters((previous) => ({ ...previous, tags: selected }))}
          icon={Tag}
        />
        <select
          aria-label="Note status"
          value={filters.status}
          onChange={(event) =>
            setFilters((previous) => ({ ...previous, status: event.target.value as NoteFilters['status'] }))
          }
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="detached">Text removed</option>
        </select>
        <select
          aria-label="Note scene"
          value={filters.sceneId}
          onChange={(event) => setFilters((previous) => ({ ...previous, sceneId: event.target.value }))}
        >
          <option value="">All scenes</option>
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.number}. {scene.location}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label="Clear note filters"
          title="Clear note filters"
          disabled={!filtered}
          onClick={() => setFilters(initialFilters)}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="notes-result-bar">
        <span aria-live="polite">
          {notes.length} of {project.annotations.length} notes
        </span>
        <label>
          Sort
          <select
            aria-label="Sort notes"
            value={filters.sort}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, sort: event.target.value as NoteFilters['sort'] }))
            }
          >
            <option value="recent">Recently updated</option>
            <option value="scene">Screenplay order</option>
          </select>
        </label>
      </div>
      <PassageNoteList notes={notes} project={project} scenes={scenes} {...actions} />
      {!notes.length && (
        <div className="notes-empty">
          <MessageSquare size={28} />
          <h2>{project.annotations.length ? 'No matching notes' : 'No passage notes yet'}</h2>
          {Boolean(filtered) && (
            <button className="button small" onClick={() => setFilters(initialFilters)}>
              <RotateCcw size={14} />
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  )
}
