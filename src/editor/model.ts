import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model'
import { Plugin, TextSelection, type Command, type EditorState } from 'prosemirror-state'
import { splitBlockAs } from 'prosemirror-commands'
import { InputRule } from 'prosemirror-inputrules'
import {
  ELEMENTS,
  cycleElement,
  makeBlock,
  nextElement,
  normalizeText,
  type ElementKind,
  type ScriptBlock,
} from '../lib/screenplay'

export const screenplaySchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    block: {
      content: 'text*',
      group: 'block',
      defining: true,
      attrs: { kind: { default: 'action' }, id: { default: null } },
      parseDOM: [
        {
          tag: 'p',
          getAttrs: (element) => {
            const kind = element.getAttribute('data-kind') as ElementKind | null
            return { kind: kind && ELEMENTS.includes(kind) ? kind : 'action', id: null }
          },
        },
      ],
      toDOM(node) {
        return ['p', { 'data-kind': node.attrs.kind, 'data-block-id': node.attrs.id }, 0]
      },
    },
    text: { group: 'inline' },
  },
})

export function toEditorDoc(blocks: ScriptBlock[]): ProseMirrorNode {
  return screenplaySchema.nodes.doc.create(
    null,
    blocks.map((block) =>
      screenplaySchema.nodes.block.create(
        { kind: block.kind, id: block.id },
        block.text ? screenplaySchema.text(block.text) : null,
      ),
    ),
  )
}

export function fromEditorDoc(doc: ProseMirrorNode): ScriptBlock[] {
  const blocks: ScriptBlock[] = []
  doc.forEach((node) =>
    blocks.push({
      id: node.attrs.id as string,
      kind: node.attrs.kind as ElementKind,
      text: normalizeText(node.attrs.kind as ElementKind, node.textContent),
    }),
  )
  return blocks
}

export function setElement(kind: ElementKind): Command {
  return (state, dispatch) => {
    const transaction = state.tr
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, position) => {
      if (node.type === screenplaySchema.nodes.block)
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, kind })
    })
    if (dispatch) dispatch(transaction.scrollIntoView())
    return true
  }
}

export const screenplayEnter: Command = (state, dispatch, view) => {
  const block = state.selection.$from.parent
  const kind = block.attrs.kind as ElementKind
  if (block.content.size === 0) return setElement(nextElement(kind, true))(state, dispatch, view)
  return splitBlockAs((node, atEnd) => ({
    type: screenplaySchema.nodes.block,
    attrs: {
      kind: atEnd ? nextElement(node.attrs.kind as ElementKind) : node.attrs.kind,
      id: crypto.randomUUID(),
    },
  }))(state, dispatch, view)
}

export function screenplayTab(backwards = false): Command {
  return (state, dispatch, view) =>
    setElement(cycleElement(state.selection.$from.parent.attrs.kind as ElementKind, backwards))(
      state,
      dispatch,
      view,
    )
}

export function documentBoundary(end: boolean): Command {
  return (state, dispatch) => {
    const selection = end ? TextSelection.atEnd(state.doc) : TextSelection.atStart(state.doc)
    if (dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView())
    return true
  }
}

export function recognizeSceneHeading(
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
) {
  const transaction = state.tr.insertText(match[0].toUpperCase(), start, end)
  return transaction.setBlockType(start, start, screenplaySchema.nodes.block, {
    ...state.selection.$from.parent.attrs,
    kind: 'scene',
  })
}

export const sceneHeadingRule = new InputRule(/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s$/i, recognizeSceneHeading)

export const stableIds = new Plugin({
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some((transaction) => transaction.docChanged)) return null
    const seen = new Set<string>()
    const transaction = newState.tr
    newState.doc.forEach((node, position) => {
      const id = node.attrs.id as string | null
      if (!id || seen.has(id))
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, id: makeBlock('action').id })
      else seen.add(id)
    })
    return transaction.docChanged ? transaction : null
  },
})
