import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { elementMetrics, paginate, partTop, type LayoutPart, type ScriptLayout } from '../lib/layout'
import { paperMetrics, type PaperSize } from '../lib/paper'
import { fromEditorDoc } from './model'

interface PaginationState {
  decorations: DecorationSet
  layout: ScriptLayout
}
export const paginationKey = new PluginKey<PaginationState>('pagination')

function gapWidget(
  height: number,
  top: number,
  markers: LayoutPart[],
  inline: boolean,
  indent: number,
  paperSize: PaperSize,
) {
  const metrics = elementMetrics(paperSize)
  const page = paperMetrics(paperSize)
  return () => {
    const element = document.createElement(inline ? 'span' : 'div')
    element.className = 'page-spacer'
    element.contentEditable = 'false'
    element.setAttribute('aria-hidden', 'true')
    element.style.height = `${height}px`
    for (const marker of markers) {
      const label = document.createElement('span')
      label.className = 'continuation-marker'
      label.textContent = marker.lines[0].text
      label.style.top = `${partTop(marker, paperSize) - top}px`
      label.style.left = `${(metrics[marker.kind].indent - indent) * page.charWidth}px`
      element.append(label)
    }
    return element
  }
}

function buildPagination(doc: ProseMirrorNode, paperSize: PaperSize): PaginationState {
  const layout = paginate(fromEditorDoc(doc), paperSize)
  const page = paperMetrics(paperSize)
  const metrics = elementMetrics(paperSize)
  const top = (part: LayoutPart) => partTop(part, paperSize)
  const partsById = new Map<string, LayoutPart[]>()
  const markers = layout.parts.filter((part) => part.marker)
  for (const part of layout.parts) {
    if (part.marker) continue
    const existing = partsById.get(part.blockId) ?? []
    existing.push(part)
    partsById.set(part.blockId, existing)
  }
  const decorations: Decoration[] = []
  let bottom = page.top
  doc.forEach((node, position) => {
    const parts = partsById.get(node.attrs.id as string)
    if (!parts?.length) return
    const first = parts[0]
    const gap = top(first) - bottom
    const attrs = {
      style: `margin-top:${gap <= page.lineHeight ? gap : 0}px`,
      'data-page': String(first.page + 1),
    }
    decorations.push(Decoration.node(position, position + node.nodeSize, attrs))
    if (gap > page.lineHeight) {
      const localMarkers = markers.filter((marker) => top(marker) >= bottom && top(marker) < top(first))
      decorations.push(
        Decoration.widget(position, gapWidget(gap, bottom, localMarkers, false, 0, paperSize), {
          side: -1,
          key: `gap-${paperSize}-${node.attrs.id}-${gap}`,
        }),
      )
    }
    for (let index = 1; index < parts.length; index += 1) {
      const previous = parts[index - 1]
      const next = parts[index]
      const previousBottom = top(previous) + previous.lines.length * page.lineHeight
      const height = top(next) - previousBottom
      const localMarkers = markers.filter(
        (marker) => top(marker) >= previousBottom && top(marker) < top(next),
      )
      decorations.push(
        Decoration.widget(
          position + 1 + next.lines[0].from,
          gapWidget(height, previousBottom, localMarkers, true, metrics[next.kind].indent, paperSize),
          { side: -1, key: `split-${paperSize}-${node.attrs.id}-${index}-${height}` },
        ),
      )
    }
    const last = parts[parts.length - 1]
    bottom = top(last) + last.lines.length * page.lineHeight
  })
  return { layout, decorations: DecorationSet.create(doc, decorations) }
}

export function paginationPlugin(initialPaperSize: PaperSize = 'letter') {
  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: (_, state) => buildPagination(state.doc, initialPaperSize),
      apply: (transaction, value) => {
        const paperSize =
          (transaction.getMeta(paginationKey) as PaperSize | undefined) ?? value.layout.paperSize
        return transaction.docChanged || paperSize !== value.layout.paperSize
          ? buildPagination(transaction.doc, paperSize)
          : value
      },
    },
    props: { decorations: (state) => paginationKey.getState(state)?.decorations },
  })
}
