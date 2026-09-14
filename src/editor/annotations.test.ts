import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { history, undo, redo } from 'prosemirror-history'
import { createScreenplay, makeBlock } from '../lib/screenplay'
import type { PassageNote } from '../lib/annotations'
import { documentWithNotes, markNote, noteDecorations, readNoteRanges, selectedPassage } from './annotations'
import { fromEditorDoc, screenplayEnter, setElement, stableIds } from './model'

function fixture() {
  const project = createScreenplay()
  project.blocks = [makeBlock('action', 'The sleeping streets.'), makeBlock('action', 'A train passes.')]
  const note: PassageNote = {
    id: 'note-one',
    text: 'Lower the ambience.',
    quote: 'sleeping',
    departments: ['Sound', 'Music'],
    tags: ['general'],
    resolved: false,
    ranges: [{ blockId: project.blocks[0].id, from: 4, to: 12 }],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
  const state = EditorState.create({
    doc: documentWithNotes(project.blocks, [note]),
    plugins: [stableIds, history()],
  })
  return { project, note, state }
}

describe('passage note anchors', () => {
  it('captures a word or a passage spanning paragraphs', () => {
    const { state, project, note } = fixture()
    expect(selectedPassage(state.doc, 5, 13)).toEqual({ quote: 'sleeping', ranges: note.ranges })
    const passage = selectedPassage(state.doc, 5, state.doc.content.size - 1)!
    expect(passage.quote).toBe('sleeping streets.\nA train passes.')
    expect(passage.ranges.map((range) => range.blockId)).toEqual(project.blocks.map((block) => block.id))
  })
  it('moves anchors when text is inserted before them', () => {
    const { state, note } = fixture()
    const changed = state.apply(state.tr.insertText('Quietly, ', 1))
    expect(readNoteRanges(changed.doc).get(note.id)).toEqual([{ ...note.ranges[0], from: 13, to: 21 }])
  })
  it('retains and restores removed anchors through undo and redo', () => {
    const { state: original, note } = fixture()
    let state = original.apply(original.tr.delete(5, 13))
    expect(readNoteRanges(state.doc).get(note.id)).toBeUndefined()
    undo(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(readNoteRanges(state.doc).get(note.id)).toEqual(note.ranges)
    redo(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(readNoteRanges(state.doc).get(note.id)).toBeUndefined()
  })
  it('keeps anchors across paragraph splits and scene reordering', () => {
    const { state: original, note } = fixture()
    let state = original.apply(original.tr.setSelection(TextSelection.create(original.doc, 8)))
    screenplayEnter(state, (transaction) => {
      state = state.applyTransaction(transaction).state
    })
    const ranges = readNoteRanges(state.doc).get(note.id)!
    expect(ranges).toHaveLength(2)
    const blocks = fromEditorDoc(state.doc)
    expect(
      ranges
        .map((range) => blocks.find((block) => block.id === range.blockId)!.text.slice(range.from, range.to))
        .join(''),
    ).toBe('sleeping')
    const reordered = documentWithNotes([...blocks].reverse(), [{ ...note, ranges }])
    expect(readNoteRanges(reordered).get(note.id)).toEqual([...ranges].reverse())
  })
  it('supports overlapping notes without rendering deleted-note highlights', () => {
    const { state, note } = fixture()
    const transaction = state.tr
    markNote(transaction, 'note-two', [{ ...note.ranges[0], from: 8, to: 17 }])
    expect(readNoteRanges(transaction.doc).get(note.id)).toEqual(note.ranges)
    expect(readNoteRanges(transaction.doc).get('note-two')).toEqual([{ ...note.ranges[0], from: 8, to: 17 }])
    expect(noteDecorations(transaction.doc, []).find()).toHaveLength(0)
  })
  it('keeps stored offsets correct when uppercase formatting expands a character', () => {
    const { state: original, project, note } = fixture()
    project.blocks[0].text = 'Straße sleeping'
    note.ranges = [{ blockId: project.blocks[0].id, from: 7, to: 15 }]
    let state = EditorState.create({ doc: documentWithNotes(project.blocks, [note]) })
    setElement('scene')(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(readNoteRanges(state.doc).get(note.id)).toEqual([{ ...note.ranges[0], from: 8, to: 16 }])
    expect(original.doc.textContent).toContain('sleeping')
  })
})
