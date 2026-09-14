import { useState, type FormEvent } from 'react'
import { Link2, LoaderCircle, Plus, Save, X } from 'lucide-react'
import { Dialog } from './Dialog'
import { FloatingNotifications } from './FloatingNotifications'
import {
  DEPARTMENTS,
  MAX_DEPARTMENTS,
  SUGGESTED_TAGS,
  normalizeDepartment,
  normalizeTag,
  type Department,
  type PassageNote,
  type PassageSelection,
} from '../lib/annotations'
import { NoteTextField } from './NoteTextField'

export interface NoteValues {
  text: string
  departments: Department[]
  tags: string[]
  resolved: boolean
  selection: PassageSelection
}

export function PassageNoteForm({
  note,
  initialText = '',
  selection,
  alternateSelection,
  tags: availableTags,
  departments: availableDepartments,
  disabled,
  saving = false,
  onSave,
  onClose,
}: {
  note: PassageNote | null
  initialText?: string
  selection: PassageSelection
  alternateSelection: PassageSelection | null
  tags: string[]
  departments: string[]
  disabled: boolean
  saving?: boolean
  onSave(values: NoteValues): void
  onClose(): void
}) {
  const [text, setText] = useState(note?.text ?? initialText)
  const [departments, setDepartments] = useState<Department[]>(note?.departments ?? [])
  const [tags, setTags] = useState(note?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [departmentInput, setDepartmentInput] = useState('')
  const [resolved, setResolved] = useState(note?.resolved ?? false)
  const [anchor, setAnchor] = useState(selection)
  const [error, setError] = useState('')
  const suggestions = [...new Set([...SUGGESTED_TAGS, ...availableTags, ...tags])]
  const departmentSuggestions = [...new Set([...DEPARTMENTS, ...availableDepartments, ...departments])]
  const canAttach =
    note && alternateSelection && JSON.stringify(anchor.ranges) !== JSON.stringify(alternateSelection.ranges)
  function addTag(value: string) {
    const tag = normalizeTag(value)
    if (!tag) return
    if (tag.length > 40 || (tags.length >= 12 && !tags.includes(tag))) {
      setError('Use up to 12 tags, with no more than 40 characters each.')
      return
    }
    setTags((previous) => [...new Set([...previous, tag])])
    setTagInput('')
    setError('')
  }
  function addDepartment(value: string) {
    const department = normalizeDepartment(value)
    if (!department) return
    if (
      department.length > 40 ||
      (!departments.includes(department) && departments.length >= MAX_DEPARTMENTS)
    ) {
      setError(`Use up to ${MAX_DEPARTMENTS} departments, each 40 characters or fewer.`)
      return
    }
    setDepartments((previous) => [...new Set([...previous, department])])
    setDepartmentInput('')
    setError('')
  }
  function toggleDepartment(value: string) {
    const department = normalizeDepartment(value)
    if (!department) return
    if (departments.includes(department))
      setDepartments((previous) => previous.filter((item) => item !== department))
    else addDepartment(department)
  }
  function toggleTag(value: string) {
    const tag = normalizeTag(value)
    if (!tag) return
    if (tags.includes(tag)) setTags((previous) => previous.filter((item) => item !== tag))
    else addTag(tag)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    if (!text.trim()) {
      setError('Enter a note before saving.')
      return
    }
    const pendingTag = normalizeTag(tagInput)
    const selectedTags = [...new Set([...tags, ...(pendingTag ? [pendingTag] : [])])]
    if (selectedTags.length > 12 || pendingTag.length > 40) {
      setError('Use up to 12 tags, with no more than 40 characters each.')
      return
    }
    onSave({ text: text.trim(), departments, tags: selectedTags, resolved, selection: anchor })
  }
  return (
    <Dialog
      title={note ? 'Edit passage note' : 'New passage note'}
      className="dialog-details dialog-note"
      onClose={onClose}
    >
      <form
        className="details-form"
        onSubmit={submit}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            event.stopPropagation()
            if (!disabled) event.currentTarget.requestSubmit()
          }
        }}
      >
        <div className="note-form-body">
          <div className="note-anchor-heading">
            <span className="field-heading">Selected text</span>
            {canAttach && (
              <button
                type="button"
                className="button small"
                disabled={disabled}
                onClick={() => setAnchor(alternateSelection!)}
              >
                <Link2 size={14} />
                Attach selected text
              </button>
            )}
          </div>
          <blockquote className="note-quote-preview">{anchor.quote}</blockquote>
          <NoteTextField
            value={text}
            disabled={disabled}
            departments={departments}
            tags={tags}
            departmentSuggestions={departmentSuggestions}
            tagSuggestions={suggestions}
            onChange={setText}
            onToggleDepartment={toggleDepartment}
            onToggleTag={toggleTag}
          />
          <fieldset className="note-departments" disabled={disabled}>
            <legend>Departments</legend>
            <div className="department-options">
              {departmentSuggestions.map((department) => (
                <label key={department}>
                  <input
                    type="checkbox"
                    checked={departments.includes(department)}
                    onChange={(event) =>
                      event.target.checked
                        ? addDepartment(department)
                        : setDepartments((previous) => previous.filter((item) => item !== department))
                    }
                  />
                  {department}
                </label>
              ))}
            </div>
            <div className="note-tag-input">
              <input
                id="note-department-input"
                aria-label="New department"
                value={departmentInput}
                maxLength={40}
                disabled={disabled}
                placeholder="New department"
                onChange={(event) => setDepartmentInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addDepartment(departmentInput)
                  }
                }}
              />
              <button
                type="button"
                className="icon-button"
                title="Add department"
                aria-label="Add department"
                disabled={disabled || !departmentInput.trim()}
                onClick={() => addDepartment(departmentInput)}
              >
                <Plus size={16} />
              </button>
            </div>
          </fieldset>
          <div className="note-tags-editor">
            <label htmlFor="note-tag-input">Tags</label>
            {tags.length > 0 && (
              <div className="note-tag-list">
                {tags.map((tag) => (
                  <span className="note-tag" key={tag}>
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      title={`Remove tag ${tag}`}
                      disabled={disabled}
                      onClick={() => setTags((previous) => previous.filter((item) => item !== tag))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="note-tag-input">
              <input
                id="note-tag-input"
                value={tagInput}
                maxLength={40}
                disabled={disabled}
                placeholder="New tag"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTag(tagInput)
                  }
                }}
              />
              <button
                type="button"
                className="icon-button"
                title="Add tag"
                aria-label="Add tag"
                disabled={disabled || !tagInput.trim()}
                onClick={() => addTag(tagInput)}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="tag-suggestions">
              {suggestions.map((tag) => (
                <label key={tag}>
                  <input
                    type="checkbox"
                    checked={tags.includes(tag)}
                    disabled={disabled || (!tags.includes(tag) && tags.length >= 12)}
                    onChange={(event) =>
                      event.target.checked
                        ? addTag(tag)
                        : setTags((previous) => previous.filter((item) => item !== tag))
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>
          {note && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={resolved}
                disabled={disabled}
                onChange={(event) => setResolved(event.target.checked)}
              />
              Resolved
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={disabled}>
            {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </form>
      <FloatingNotifications
        notices={
          error ? [{ id: 'note-form-error', message: error, tone: 'error', dismiss: () => setError('') }] : []
        }
      />
    </Dialog>
  )
}
