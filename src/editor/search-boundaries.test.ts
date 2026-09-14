import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { makeBlock } from '../lib/screenplay'
import { toEditorDoc } from './model'
import { findMatches } from './search'

describe('Unicode-safe literal search', () => {
  it('keeps offsets in the original text after expanding lowercase characters', () => {
    const text = '\u0130stanbul contains a train. A TRAIN arrives.'
    const document = toEditorDoc([makeBlock('action', text)])
    const matches = findMatches(document, 'train')
    expect(matches).toHaveLength(2)
    expect(matches.map((match) => document.textBetween(match.from, match.to))).toEqual(['train', 'TRAIN'])
    expect(matches[0].from).toBe(1 + text.indexOf('train'))
    let state = EditorState.create({ doc: document })
    state = state.apply(
      state.tr
        .setSelection(TextSelection.create(state.doc, matches[0].from, matches[0].to))
        .insertText('tram'),
    )
    expect(state.doc.textContent).toBe('\u0130stanbul contains a tram. A TRAIN arrives.')
  })

  it('treats regex syntax as literal text and stays within the original text', () => {
    const document = toEditorDoc([makeBlock('action', '\u0130.* [a-z] (x) \\ ? + $ 🎬')])
    for (const query of ['.*', '[a-z]', '(x)', '\\', '?', '+', '$', '🎬']) {
      const matches = findMatches(document, query)
      expect(matches).toHaveLength(1)
      expect(document.textBetween(matches[0].from, matches[0].to)).toBe(query)
    }
  })
})
