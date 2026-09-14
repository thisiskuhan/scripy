import type { ElementKind, ScriptBlock } from './screenplay'
import { paperMetrics, type PaperSize } from './paper'

export const PAGE = paperMetrics('letter')
export const METRICS: Record<ElementKind, { indent: number; columns: number }> = {
  scene: { indent: 0, columns: 60 },
  action: { indent: 0, columns: 60 },
  character: { indent: 22, columns: 33 },
  dialogue: { indent: 10, columns: 35 },
  parenthetical: { indent: 16, columns: 26 },
  transition: { indent: 0, columns: 60 },
  shot: { indent: 0, columns: 60 },
}

export function elementMetrics(size: PaperSize = 'letter'): typeof METRICS {
  if (size === 'letter') return METRICS
  const page = paperMetrics(size)
  const columns = Math.floor((page.width - page.left - page.right) / page.charWidth)
  return {
    ...METRICS,
    scene: { indent: 0, columns },
    action: { indent: 0, columns },
    transition: { indent: 0, columns },
    shot: { indent: 0, columns },
  }
}

export interface WrappedLine {
  text: string
  from: number
  to: number
}
export interface LayoutPart {
  blockId: string
  kind: ElementKind
  page: number
  row: number
  lines: WrappedLine[]
  marker?: 'more' | 'continued'
}
export interface ScriptLayout {
  paperSize: PaperSize
  parts: LayoutPart[]
  pageCount: number
  blockPages: Map<string, number>
}

export function wrapText(text: string, columns: number): WrappedLine[] {
  const lines: WrappedLine[] = []
  let offset = 0
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let start = 0
    if (!paragraph.length) lines.push({ text: '', from: offset, to: offset })
    while (start < paragraph.length) {
      let end = Math.min(start + columns, paragraph.length)
      let next = end
      if (end < paragraph.length) {
        const space = paragraph.lastIndexOf(' ', end)
        if (space > start) {
          end = space
          next = space + 1
        } else if (end > start && /[\uD800-\uDBFF]/.test(paragraph[end - 1])) {
          end -= 1
          next = end
        }
      }
      lines.push({ text: paragraph.slice(start, end), from: offset + start, to: offset + next })
      start = next
    }
    offset += paragraph.length + 1
  }
  return lines
}

export function paginate(blocks: ScriptBlock[], paperSize: PaperSize = 'letter'): ScriptLayout {
  const pageMetrics = paperMetrics(paperSize)
  const metrics = elementMetrics(paperSize)
  const parts: LayoutPart[] = []
  const blockPages = new Map<string, number>()
  const wrapped = blocks.map((block) => wrapText(block.text, metrics[block.kind].columns))
  let page = 0
  let row = 0
  let character = ''

  const marker = (blockId: string, kind: ElementKind, text: string, type: 'more' | 'continued') => {
    parts.push({ blockId, kind, page, row, lines: [{ text, from: -1, to: -1 }], marker: type })
    row += 1
  }

  blocks.forEach((block, index) => {
    const previous = blocks[index - 1]
    const connected =
      ['dialogue', 'parenthetical'].includes(block.kind) &&
      previous &&
      ['character', 'dialogue', 'parenthetical'].includes(previous.kind)
    let spacing = index === 0 || connected ? 0 : 1
    const lines = wrapped[index]
    let required = Math.min(lines.length, 2)
    if (block.kind === 'scene' || block.kind === 'character' || block.kind === 'parenthetical') {
      required = lines.length
      let following = index + 1
      while (following < blocks.length && ['character', 'parenthetical'].includes(blocks[following].kind)) {
        required += wrapped[following].length + (blocks[following].kind === 'character' ? 1 : 0)
        following += 1
      }
      if (following < blocks.length)
        required += Math.min(wrapped[following].length, 2) + (block.kind === 'scene' ? 1 : 0)
      required = Math.min(required, pageMetrics.rows)
    }
    if (row > 0 && row + spacing + required > pageMetrics.rows) {
      if (connected && character && row < pageMetrics.rows)
        marker(block.id, 'parenthetical', '(MORE)', 'more')
      page += 1
      row = 0
      spacing = 0
      if (connected && character) marker(block.id, 'character', `${character} (CONT'D)`, 'continued')
    }
    if (row === 0) spacing = 0
    row += spacing
    blockPages.set(block.id, page + 1)
    if (block.kind === 'character') character = block.text.replace(/\s*\(CONT'D\)$/i, '')
    else if (!['dialogue', 'parenthetical'].includes(block.kind)) character = ''

    let consumed = 0
    while (consumed < lines.length) {
      const remaining = lines.length - consumed
      const available = pageMetrics.rows - row
      const splitDialogue = block.kind === 'dialogue' && character && remaining > available
      const count = Math.min(remaining, available - (splitDialogue ? 1 : 0))
      if (count > 0) {
        parts.push({
          blockId: block.id,
          kind: block.kind,
          page,
          row,
          lines: lines.slice(consumed, consumed + count),
        })
        row += count
        consumed += count
      }
      if (consumed < lines.length) {
        if (splitDialogue && row < pageMetrics.rows) marker(block.id, 'parenthetical', '(MORE)', 'more')
        page += 1
        row = 0
        if (block.kind === 'dialogue' && character)
          marker(block.id, 'character', `${character} (CONT'D)`, 'continued')
      }
    }
  })
  return { paperSize, parts, pageCount: page + 1, blockPages }
}

export function partTop(part: LayoutPart, paperSize: PaperSize = 'letter'): number {
  const metrics = paperMetrics(paperSize)
  return part.page * (metrics.height + metrics.gap) + metrics.top + part.row * metrics.lineHeight
}
