import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeDepartment, normalizeTag } from '../lib/annotations'

interface Trigger {
  type: '/' | '#'
  query: string
  start: number
}

interface MentionOption {
  value: string
  label: string
  selected: boolean
}

// A `/` or `#` token is active only when it starts the line or follows whitespace.
function detectTrigger(value: string, caret: number): Trigger | null {
  if (caret < value.length && /\S/.test(value[caret])) return null
  for (let i = caret - 1; i >= 0; i -= 1) {
    const character = value[i]
    if (character === '/' || character === '#') {
      const before = i === 0 ? ' ' : value[i - 1]
      if (!/\s/.test(before)) return null
      return { type: character, query: value.slice(i + 1, caret), start: i }
    }
    if (!/[\p{L}\p{N}&'-]/u.test(character)) return null
  }
  return null
}

export function NoteTextField({
  value,
  disabled,
  departments,
  tags,
  departmentSuggestions,
  tagSuggestions,
  onChange,
  onToggleDepartment,
  onToggleTag,
}: {
  value: string
  disabled: boolean
  departments: string[]
  tags: string[]
  departmentSuggestions: string[]
  tagSuggestions: string[]
  onChange(value: string): void
  onToggleDepartment(value: string): void
  onToggleTag(value: string): void
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const caretAfter = useRef<number | null>(null)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => setIndex(0), [trigger?.type, trigger?.start, trigger?.query])
  useLayoutEffect(() => {
    if (caretAfter.current !== null && textarea.current) {
      textarea.current.focus()
      textarea.current.setSelectionRange(caretAfter.current, caretAfter.current)
      caretAfter.current = null
    }
  })

  function updateTrigger(field: HTMLTextAreaElement) {
    const next =
      field.selectionStart === field.selectionEnd ? detectTrigger(field.value, field.selectionStart) : null
    setTrigger((previous) =>
      next?.type === previous?.type && next?.start === previous?.start && next?.query === previous?.query
        ? previous
        : next,
    )
  }

  const options: MentionOption[] = []
  let createLabel = ''
  if (trigger) {
    if (trigger.type === '/') {
      const query = trigger.query.trim().toLowerCase()
      const custom = normalizeDepartment(trigger.query)
      for (const department of departmentSuggestions)
        if (department.toLowerCase().includes(query))
          options.push({ value: department, label: department, selected: departments.includes(department) })
      if (
        custom &&
        !departmentSuggestions.some((department) => department.toLowerCase() === custom.toLowerCase())
      )
        createLabel = `Create department "${custom}"`
    } else {
      const query = normalizeTag(trigger.query)
      for (const tag of tagSuggestions)
        if (tag.includes(query)) options.push({ value: tag, label: `#${tag}`, selected: tags.includes(tag) })
      if (query && !tagSuggestions.includes(query)) createLabel = `Create tag "#${query}"`
    }
  }
  if (trigger && createLabel)
    options.push({
      value: trigger.type === '/' ? normalizeDepartment(trigger.query) : normalizeTag(trigger.query),
      label: createLabel,
      selected: false,
    })
  const active = Math.min(index, Math.max(0, options.length - 1))

  function choose(option: MentionOption) {
    if (!trigger) return
    const end = trigger.start + 1 + trigger.query.length
    caretAfter.current = trigger.start
    onChange(value.slice(0, trigger.start) + value.slice(end))
    if (trigger.type === '/') onToggleDepartment(option.value)
    else onToggleTag(option.value)
    setTrigger(null)
  }

  return (
    <div className="note-mention-field">
      <div className="mention-anchor">
        <label className="field-label">
          Note
          <textarea
            id="note-text"
            ref={textarea}
            aria-label="Note text"
            autoFocus
            required
            maxLength={20000}
            rows={4}
            value={value}
            disabled={disabled}
            aria-autocomplete="list"
            aria-expanded={options.length > 0}
            aria-controls="note-mention-list"
            aria-activedescendant={options.length ? `note-mention-${active}` : undefined}
            onChange={(event) => {
              onChange(event.target.value)
              updateTrigger(event.target)
            }}
            onClick={(event) => updateTrigger(event.currentTarget)}
            onKeyUp={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key))
                updateTrigger(event.currentTarget)
            }}
            onKeyDown={(event) => {
              if (!trigger || !options.length) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((value) => (value + 1) % options.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((value) => (value - 1 + options.length) % options.length)
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                event.stopPropagation()
                choose(options[active])
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setTrigger(null)
              }
            }}
          />
        </label>
        {trigger && options.length > 0 && (
          <ul
            className="mention-menu"
            id="note-mention-list"
            role="listbox"
            aria-label={trigger.type === '/' ? 'Department suggestions' : 'Tag suggestions'}
          >
            {options.map((option, position) => (
              <li
                key={`${option.label}-${position}`}
                id={`note-mention-${position}`}
                role="option"
                aria-selected={position === active}
                className={`mention-option${position === active ? ' is-active' : ''}${option.selected ? ' is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
                onMouseEnter={() => setIndex(position)}
              >
                <span>{option.label}</span>
                {option.selected && <span aria-hidden="true">✓</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mention-hint">
        Type <kbd>/</kbd> to assign departments and <kbd>#</kbd> for tags.
      </p>
    </div>
  )
}
