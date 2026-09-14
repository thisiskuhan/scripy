import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { history, undo } from 'prosemirror-history'
import { makeBlock } from '../lib/screenplay'
import { toEditorDoc } from './model'
import { paginationKey, paginationPlugin } from './pagination'

describe('live paper-size changes', () => {
  it('repaginates without losing text, selection, or undo history', () => {
    const block = makeBlock('action', Array(57).fill('A line.').join('\n'))
    let state = EditorState.create({ doc: toEditorDoc([block]), plugins: [history(), paginationPlugin()] })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)).insertText('New text. '))
    const position = state.selection.from
    expect(paginationKey.getState(state)!.layout.pageCount).toBe(2)
    state = state.apply(state.tr.setMeta(paginationKey, 'a4').setMeta('addToHistory', false))
    expect(paginationKey.getState(state)!.layout.pageCount).toBe(1)
    expect(state.selection.from).toBe(position)
    undo(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(state.doc.textContent).toBe(block.text)
    expect(paginationKey.getState(state)!.layout.paperSize).toBe('a4')
  })
})
