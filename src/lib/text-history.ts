import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history'

const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } })
const textDocument = (value: string) => schema.node('doc', null, value ? schema.text(value) : undefined)

export class TextHistory {
  private state: EditorState

  constructor(value: string) {
    this.state = EditorState.create({ doc: textDocument(value), plugins: [history({ depth: 100 })] })
  }

  get value() {
    return this.state.doc.textContent
  }
  get canUndo() {
    return undoDepth(this.state) > 0
  }
  get canRedo() {
    return redoDepth(this.state) > 0
  }
  get selection() {
    return { from: this.state.selection.from, to: this.state.selection.to }
  }

  select(from: number, to: number) {
    const selection = TextSelection.create(this.state.doc, from, to)
    if (!selection.eq(this.state.selection))
      this.state = this.state.apply(
        closeHistory(this.state.tr.setSelection(selection)).setMeta('addToHistory', false),
      )
  }

  change(value: string, from: number, to: number) {
    const next = textDocument(value)
    const start = this.state.doc.content.findDiffStart(next.content)
    if (start === null) {
      this.select(from, to)
      return
    }
    const end = this.state.doc.content.findDiffEnd(next.content)!
    const overlap = Math.max(0, start - Math.min(end.a, end.b))
    const transaction = this.state.tr.replaceWith(
      start,
      end.a + overlap,
      next.content.cut(start, end.b + overlap),
    )
    transaction.setSelection(TextSelection.create(transaction.doc, from, to))
    this.state = this.state.apply(transaction)
  }

  step(direction: 'undo' | 'redo', accept: (value: string) => boolean): boolean {
    let applied = false
    const dispatch = (transaction: Transaction) => {
      const next = this.state.apply(transaction)
      if (accept(next.doc.textContent)) {
        this.state = next
        applied = true
      }
    }
    if (direction === 'undo') undo(this.state, dispatch)
    else redo(this.state, dispatch)
    return applied
  }
}
