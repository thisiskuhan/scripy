import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { makeBlock } from '../lib/screenplay'
import { documentBoundary, fromEditorDoc, screenplayEnter, toEditorDoc } from './model'

describe('document-boundary navigation', () => {
  it('sets the final caret before an immediately following Enter command', () => {
    let state = EditorState.create({
      doc: toEditorDoc([
        makeBlock('scene', 'INT. ROOM - DAY'),
        makeBlock('action', 'A final moment.'),
        makeBlock('transition', 'FADE OUT.'),
      ]),
    })
    documentBoundary(true)(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(state.selection.$from.parent.attrs.kind).toBe('transition')
    screenplayEnter(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(fromEditorDoc(state.doc).map((block) => block.kind)).toEqual([
      'scene',
      'action',
      'transition',
      'scene',
    ])
    documentBoundary(false)(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(state.selection.from).toBe(1)
  })
})
