import { useLayoutEffect, useReducer, useRef } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { TextHistory } from '../lib/text-history'

export function SceneMemoField({
  value,
  disabled,
  onChange,
  onSave,
}: {
  value: string
  disabled: boolean
  onChange(value: string): boolean
  onSave(): void
}) {
  const history = useRef<TextHistory | null>(null)
  history.current ??= new TextHistory(value)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ from: number; to: number } | null>(null)
  const [, refresh] = useReducer((version: number) => version + 1, 0)
  useLayoutEffect(() => {
    if (history.current!.value !== value) {
      history.current = new TextHistory(value)
      refresh()
    }
    if (pendingSelection.current && textarea.current) {
      textarea.current.focus()
      textarea.current.setSelectionRange(pendingSelection.current.from, pendingSelection.current.to)
      pendingSelection.current = null
    }
  }, [value])
  function step(direction: 'undo' | 'redo') {
    if (disabled || !history.current!.step(direction, onChange)) return
    pendingSelection.current = history.current!.selection
    refresh()
  }
  return (
    <div className="scene-memo-editor">
      <div className="memo-history-actions">
        <button
          className="icon-button"
          title="Undo memo"
          aria-label="Undo memo"
          disabled={disabled || !history.current.canUndo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step('undo')}
        >
          <Undo2 size={15} />
        </button>
        <button
          className="icon-button"
          title="Redo memo"
          aria-label="Redo memo"
          disabled={disabled || !history.current.canRedo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step('redo')}
        >
          <Redo2 size={15} />
        </button>
      </div>
      <textarea
        ref={textarea}
        id="scene-notes"
        placeholder="Add a scene note..."
        value={value}
        disabled={disabled}
        maxLength={20000}
        onSelect={(event) => {
          const field = event.currentTarget
          if (field.value === history.current!.value)
            history.current!.select(field.selectionStart, field.selectionEnd)
        }}
        onChange={(event) => {
          const field = event.currentTarget
          if (onChange(field.value)) {
            history.current!.change(field.value, field.selectionStart, field.selectionEnd)
            refresh()
          }
        }}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return
          const key = event.key.toLowerCase()
          if (key === 'z' || key === 'y' || key === 's') {
            event.preventDefault()
            event.stopPropagation()
            if (key === 's') onSave()
            else step(key === 'y' || event.shiftKey ? 'redo' : 'undo')
          }
        }}
      />
    </div>
  )
}
