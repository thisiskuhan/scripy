import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { Transform } from 'prosemirror-transform'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { normalizeText, type ElementKind, type ScriptBlock } from '../lib/screenplay'
import type { NoteRange, PassageNote, PassageSelection } from '../lib/annotations'
import { screenplaySchema, toEditorDoc } from './model'

function storedOffset(block: ProseMirrorNode, offset: number): number {
  return normalizeText(block.attrs.kind as ElementKind, block.textContent.slice(0, offset)).length
}

function editorOffset(block: ProseMirrorNode, offset: number): number {
  const kind = block.attrs.kind as ElementKind
  if (normalizeText(kind, block.textContent) === block.textContent) return offset
  let stored = 0
  let actual = 0
  for (const character of block.textContent) {
    if (stored >= offset) break
    stored += normalizeText(kind, character).length
    actual += character.length
  }
  return actual
}

export function selectedPassage(doc: ProseMirrorNode, from: number, to: number): PassageSelection | null {
  if (from === to) return null
  const ranges: NoteRange[] = []
  const quotes: string[] = []
  doc.forEach((block, position) => {
    const start = Math.max(0, from - position - 1)
    const end = Math.min(block.content.size, to - position - 1)
    if (end <= start) return
    ranges.push({
      blockId: block.attrs.id as string,
      from: storedOffset(block, start),
      to: storedOffset(block, end),
    })
    quotes.push(normalizeText(block.attrs.kind as ElementKind, block.textContent.slice(start, end)))
  })
  const quote = quotes.join('\n')
  return quote.trim() && quote.length <= 20000 && ranges.length <= 200 ? { quote, ranges } : null
}

export function readNoteRanges(doc: ProseMirrorNode): Map<string, NoteRange[]> {
  const ranges = new Map<string, NoteRange[]>()
  doc.forEach((block) => {
    block.forEach((node, offset) => {
      for (const mark of node.marks) {
        if (mark.type !== screenplaySchema.marks.passageNote) continue
        const id = mark.attrs.id as string
        const entries = ranges.get(id) ?? []
        const from = storedOffset(block, offset)
        const to = storedOffset(block, offset + node.nodeSize)
        const previous = entries[entries.length - 1]
        if (previous?.blockId === block.attrs.id && previous.to === from) previous.to = to
        else entries.push({ blockId: block.attrs.id as string, from, to })
        ranges.set(id, entries)
      }
    })
  })
  return ranges
}

export function markNote(transform: Transform, id: string, ranges: NoteRange[]): void {
  const mark = screenplaySchema.marks.passageNote.create({ id })
  const positions = new Map<string, { node: ProseMirrorNode; position: number }>()
  transform.doc.forEach((node, position) => positions.set(node.attrs.id as string, { node, position }))
  for (const range of ranges) {
    const block = positions.get(range.blockId)
    if (!block) continue
    const from = editorOffset(block.node, range.from)
    const to = editorOffset(block.node, range.to)
    if (from < to && to <= block.node.content.size)
      transform.addMark(block.position + 1 + from, block.position + 1 + to, mark)
  }
}

export function documentWithNotes(blocks: ScriptBlock[], notes: PassageNote[]): ProseMirrorNode {
  const transform = new Transform(toEditorDoc(blocks))
  for (const note of notes) markNote(transform, note.id, note.ranges)
  return transform.doc
}

export function noteDecorations(doc: ProseMirrorNode, notes: PassageNote[]): DecorationSet {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const decorations: Decoration[] = []
  doc.descendants((node, position) => {
    if (!node.isText) return
    const marked = node.marks.flatMap((mark) => {
      const note =
        mark.type === screenplaySchema.marks.passageNote ? byId.get(mark.attrs.id as string) : undefined
      return note ? [note] : []
    })
    if (!marked.length) return
    decorations.push(
      Decoration.inline(position, position + node.nodeSize, {
        class: `passage-highlight${marked.every((note) => note.resolved) ? ' is-resolved' : ''}`,
        title: marked.map((note) => note.text.slice(0, 160)).join('\n'),
      }),
    )
  })
  return DecorationSet.create(doc, decorations)
}

export function notePosition(doc: ProseMirrorNode, range: NoteRange): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null
  doc.forEach((block, position) => {
    if (block.attrs.id === range.blockId)
      result = {
        from: position + 1 + editorOffset(block, range.from),
        to: position + 1 + editorOffset(block, range.to),
      }
  })
  return result
}
