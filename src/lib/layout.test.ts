import { describe, expect, it } from 'vitest'
import { makeBlock } from './screenplay'
import { PAGE, elementMetrics, paginate, partTop, wrapText } from './layout'
import { paperMetrics } from './paper'

describe('screenplay page layout', () => {
  it('uses ISO A4 dimensions while retaining US Letter as the default', () => {
    const a4 = paperMetrics('a4')
    expect((a4.width / 96) * 25.4).toBeCloseTo(210, 6)
    expect((a4.height / 96) * 25.4).toBeCloseTo(297, 6)
    expect(a4.rows).toBe(58)
    expect(elementMetrics('a4').action.columns).toBe(57)
    expect(paperMetrics()).toEqual(PAGE)
    expect(PAGE.rows).toBe(54)
  })

  it('repaginates to the chosen paper size instead of scaling Letter pages', () => {
    const blocks = [makeBlock('action', Array(57).fill('A quiet line.').join('\n'))]
    expect(paginate(blocks, 'letter').pageCount).toBe(2)
    expect(paginate(blocks, 'a4').pageCount).toBe(1)
    const longLine = [makeBlock('action', 'A'.repeat(60))]
    expect(paginate(longLine, 'letter').parts[0].lines).toHaveLength(1)
    expect(paginate(longLine, 'a4').parts[0].lines).toHaveLength(2)
  })

  it('positions A4 continuation pages using the same metrics as pagination', () => {
    const blocks = [
      makeBlock('character', 'MARA'),
      makeBlock('dialogue', Array(120).fill('A line.').join('\n')),
    ]
    const layout = paginate(blocks, 'a4')
    const metrics = paperMetrics('a4')
    expect(layout.parts.every((part) => part.row + part.lines.length <= metrics.rows)).toBe(true)
    const continuation = layout.parts.find((part) => part.page === 1)!
    expect(partTop(continuation, 'a4')).toBeCloseTo(metrics.height + metrics.gap + metrics.top, 6)
  })
  it('wraps at words and preserves source offsets', () => {
    expect(wrapText('The quiet hours before dawn.', 15)).toEqual([
      { text: 'The quiet hours', from: 0, to: 16 },
      { text: 'before dawn.', from: 16, to: 28 },
    ])
    expect(wrapText('', 60)).toEqual([{ text: '', from: 0, to: 0 }])
    expect(wrapText('abc\ndef', 60).map((line) => line.from)).toEqual([0, 4])
  })

  it('does not orphan scene headings at the end of a page', () => {
    const blocks = [
      makeBlock('action', Array(51).fill('A line.').join('\n')),
      makeBlock('scene', 'EXT. CITY - DAWN'),
      makeBlock('action', 'The first train arrives.'),
    ]
    const layout = paginate(blocks)
    expect(layout.blockPages.get(blocks[1].id)).toBe(2)
    expect(layout.blockPages.get(blocks[2].id)).toBe(2)
  })

  it('keeps character, parenthetical and initial dialogue together', () => {
    const blocks = [
      makeBlock('action', Array(50).fill('A line.').join('\n')),
      makeBlock('character', 'MARA'),
      makeBlock('parenthetical', '(quietly)'),
      makeBlock('dialogue', 'This is a longer piece of dialogue that occupies at least two lines.'),
    ]
    const layout = paginate(blocks)
    expect(layout.blockPages.get(blocks[1].id)).toBe(2)
    expect(layout.blockPages.get(blocks[3].id)).toBe(2)
  })

  it('adds dialogue continuation markers without losing a line of text', () => {
    const dialogue = makeBlock('dialogue', Array(120).fill('One complete line.').join('\n'))
    const layout = paginate([makeBlock('character', 'MARA'), dialogue])
    expect(layout.pageCount).toBe(3)
    expect(layout.parts.filter((part) => part.marker === 'more')).toHaveLength(2)
    expect(layout.parts.filter((part) => part.marker === 'continued')).toHaveLength(2)
    expect(
      layout.parts
        .filter((part) => !part.marker && part.blockId === dialogue.id)
        .flatMap((part) => part.lines),
    ).toHaveLength(120)
    expect(layout.parts.every((part) => part.row + part.lines.length <= PAGE.rows)).toBe(true)
  })

  it('paginates a feature-length document within an interactive budget', () => {
    const blocks = Array.from({ length: 1200 }, (_, index) =>
      makeBlock(
        index % 6 === 0 ? 'scene' : 'action',
        'The station is quiet. A distant announcement echoes through the empty hall.',
      ),
    )
    const start = performance.now()
    const layout = paginate(blocks)
    expect(layout.pageCount).toBeGreaterThan(50)
    expect(layout.blockPages.size).toBe(1200)
    expect(performance.now() - start).toBeLessThan(300)
  })
})
