import { useState } from 'react'
import { ArrowUpRight, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { passageText, type PassageNote } from '../lib/annotations'
import type { Screenplay, Scene } from '../lib/screenplay'

export interface NoteActions {
  onEdit(note: PassageNote): void
  onGo(note: PassageNote): void
  onResolve(note: PassageNote): void
  onDelete(note: PassageNote): void
  disabled: boolean
}

function noteScene(note: PassageNote, project: Screenplay, scenes: Scene[]): Scene | undefined {
  const index = project.blocks.findIndex((block) => block.id === note.ranges[0]?.blockId)
  return scenes.find((scene) => index >= scene.start && index < scene.end)
}

function NoteRow({
  note,
  project,
  scenes,
  active,
  ...actions
}: NoteActions & { note: PassageNote; project: Screenplay; scenes: Scene[]; active: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const scene = noteScene(note, project, scenes)
  return (
    <article
      className={`passage-note-row${active ? ' is-active' : ''}${note.resolved ? ' is-resolved' : ''}`}
      data-note={note.id}
    >
      <div className="note-row-heading">
        <span>
          {note.ranges.length
            ? scene
              ? `Scene ${scene.number} / ${scene.location}`
              : 'Screenplay'
            : 'Text removed'}
        </span>
        <span>{note.resolved ? 'Resolved' : 'Open'}</span>
      </div>
      <button
        className="note-passage-link"
        onClick={() => actions.onGo(note)}
        disabled={!note.ranges.length}
        title="Go to passage"
        aria-label="Go to passage"
      >
        <span>{passageText(note, project.blocks)}</span>
        {note.ranges.length > 0 && <ArrowUpRight size={14} />}
      </button>
      <p className="note-body">{note.text}</p>
      {note.departments.length > 0 && (
        <div className="note-department-list">
          {note.departments.map((department) => (
            <span key={department}>{department}</span>
          ))}
        </div>
      )}
      {note.tags.length > 0 && (
        <div className="note-tag-list">
          {note.tags.map((tag) => (
            <span className="note-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="note-row-actions">
        <time dateTime={note.updatedAt}>
          {new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </time>
        <button
          className="icon-button"
          aria-label="Edit note"
          title="Edit note"
          disabled={actions.disabled}
          onClick={() => actions.onEdit(note)}
        >
          <Pencil size={14} />
        </button>
        <button
          className="icon-button"
          aria-label={note.resolved ? 'Reopen note' : 'Resolve note'}
          title={note.resolved ? 'Reopen note' : 'Resolve note'}
          disabled={actions.disabled}
          onClick={() => actions.onResolve(note)}
        >
          {note.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
        </button>
        <button
          className="icon-button"
          aria-label="Delete note"
          title="Delete note"
          disabled={actions.disabled}
          onClick={() => setConfirmDelete(!confirmDelete)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {confirmDelete && (
        <div className="note-delete-confirm">
          <span>Delete this note?</span>
          <button className="button small" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button className="button small" disabled={actions.disabled} onClick={() => actions.onDelete(note)}>
            Delete
          </button>
        </div>
      )}
    </article>
  )
}

export function PassageNoteList({
  notes,
  project,
  scenes,
  activeId,
  ...actions
}: NoteActions & { notes: PassageNote[]; project: Screenplay; scenes: Scene[]; activeId?: string | null }) {
  return (
    <div className="passage-note-list">
      {notes.map((note) => (
        <NoteRow
          key={note.id}
          note={note}
          project={project}
          scenes={scenes}
          active={note.id === activeId}
          {...actions}
        />
      ))}
    </div>
  )
}
