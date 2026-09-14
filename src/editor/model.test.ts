import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { history, undo } from 'prosemirror-history'
import { makeBlock } from '../lib/screenplay'
import {
  fromEditorDoc,
  recognizeSceneHeading,
  screenplayEnter,
  screenplaySchema,
  screenplayTab,
  setElement,
  stableIds,
  toEditorDoc,
} from './model'
import { findMatches } from './search'

describe('ProseMirror screenplay commands', () => {
  it('creates dialogue after a character cue and can undo it', () => {
    let state = EditorState.create({
      doc: toEditorDoc([makeBlock('character', 'LENA')]),
      plugins: [stableIds, history()],
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
    screenplayEnter(state, (transaction) => {
      state = state.applyTransaction(transaction).state
    })
    expect(fromEditorDoc(state.doc).map((block) => block.kind)).toEqual(['character', 'dialogue'])
    expect(state.selection.$from.parent.attrs.kind).toBe('dialogue')
    undo(state, (transaction) => {
      state = state.applyTransaction(transaction).state
    })
    expect(fromEditorDoc(state.doc)).toHaveLength(1)
  })

  it('changes type without replacing the stable scene identity', () => {
    const block = makeBlock('action', 'LENA')
    let state = EditorState.create({ doc: toEditorDoc([block]) })
    screenplayTab()(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(fromEditorDoc(state.doc)[0]).toEqual({ ...block, kind: 'character' })
    setElement('scene')(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(fromEditorDoc(state.doc)[0].id).toBe(block.id)
  })

  it('repairs duplicate IDs on pasted elements', () => {
    const block = makeBlock('action', 'One line.')
    let state = EditorState.create({ doc: toEditorDoc([block]), plugins: [stableIds] })
    state = state.applyTransaction(
      state.tr.insert(
        state.doc.content.size,
        screenplaySchema.nodes.block.create(
          { kind: block.kind, id: block.id },
          screenplaySchema.text(block.text),
        ),
      ),
    ).state
    expect(new Set(fromEditorDoc(state.doc).map((item) => item.id)).size).toBe(2)
  })

  it('finds repeated literal text, including punctuation', () => {
    const doc = toEditorDoc([makeBlock('action', 'Wait... wait...')])
    expect(findMatches(doc, '...')).toEqual([
      { from: 5, to: 8 },
      { from: 13, to: 16 },
    ])
    expect(findMatches(doc, 'WAIT')).toHaveLength(2)
    expect(findMatches(doc, '')).toEqual([])
  })

  it('preserves the typed prefix when recognizing a scene heading', () => {
    const block = makeBlock('action', 'INT.')
    let state = EditorState.create({ doc: toEditorDoc([block]) })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
    const match = 'INT. '.match(/^(INT\.)\s$/)!
    const transaction = recognizeSceneHeading(state, match, 1, 5)
    expect(transaction).not.toBeNull()
    expect(fromEditorDoc(state.apply(transaction!).doc)[0]).toEqual({
      ...block,
      kind: 'scene',
      text: 'INT. ',
    })
  })
})
