import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  createScreenplay,
  exportFountain,
  fileName,
  getCharacters,
  getScenes,
  importFountain,
  makeBlock,
  moveScene,
  parseProject,
  serializeProject,
  validateScreenplay,
} from './screenplay'
import { validateArtwork } from './artwork'
import { chooseReopenedDraft } from './reopen'
import { paginate, wrapText } from './layout'

function legacy(overrides: Record<string, unknown> = {}) {
  const project = createScreenplay('Hostile input')
  return { ...project, ...overrides }
}

describe('hostile and boundary document inputs', () => {
  it('rejects every wrong field type instead of coercing it', () => {
    const cases: Record<string, unknown>[] = [
      { title: 42 },
      { title: null },
      { author: ['A'] },
      { draft: {} },
      { logline: 7 },
      { createdAt: 'yesterday' },
      { updatedAt: 1726300000000 },
      { blocks: 'INT. ROOM - DAY' },
      { blocks: [{ id: 'a', kind: 'action', text: 5 }] },
      { blocks: [{ id: 'a', kind: 'ACTION', text: 'x' }] },
      { blocks: [{ id: 'a', kind: 'action' }] },
      { blocks: [null] },
      { notes: [] },
      { notes: null },
      { paperSize: 'A4' },
      { paperSize: 'letter ' },
      { titleArtwork: 'data:image/png;base64,AAAA' },
      { titleArtwork: [] },
      { version: '2' },
      { version: 2.5 },
      { version: -1 },
    ]
    for (const overrides of cases) {
      expect(() => parseProject(JSON.stringify(legacy(overrides))), JSON.stringify(overrides)).toThrow()
    }
  })

  it('rejects non-object roots and JSON that is valid but not a document', () => {
    for (const text of ['null', '[]', '"a string"', '123', 'true', '{}', '{"version":2}']) {
      expect(() => parseProject(text), text).toThrow()
    }
  })

  it('enforces the byte-based 5 MB limit for multibyte text and reports it clearly', () => {
    const project = createScreenplay()
    project.blocks = Array.from({ length: 60 }, (_, index) => ({
      id: `b${index}`,
      kind: 'action',
      text: 'é'.repeat(90000),
    }))
    expect(() => serializeProject(project)).toThrow('5 MB')
    expect(() => parseProject(`{"pad":"${'é'.repeat(3 * 1024 * 1024)}"}`)).toThrow('5 MB')
  })

  it('accepts exact string-length boundaries and rejects one character beyond them', () => {
    const base = createScreenplay('x'.repeat(300))
    expect(parseProject(serializeProject(base)).title).toBe('x'.repeat(300))
    expect(() => parseProject(JSON.stringify({ ...base, title: 'x'.repeat(301) }))).toThrow()
    expect(() => parseProject(JSON.stringify({ ...base, author: 'y'.repeat(301) }))).toThrow()
    expect(() => parseProject(JSON.stringify({ ...base, draft: 'z'.repeat(101) }))).toThrow()
    expect(() => parseProject(JSON.stringify({ ...base, logline: 'q'.repeat(5001) }))).toThrow()
    const long = { ...base, blocks: [{ ...base.blocks[0], text: 'w'.repeat(100000) }] }
    expect(parseProject(JSON.stringify(long)).blocks[0].text).toHaveLength(100000)
    long.blocks[0].text = 'w'.repeat(100001)
    expect(() => parseProject(JSON.stringify(long))).toThrow()
    const notes = { ...base, notes: { [base.blocks[0].id]: 'n'.repeat(20000) } }
    expect(parseProject(JSON.stringify(notes)).notes[base.blocks[0].id]).toHaveLength(20000)
    notes.notes[base.blocks[0].id] = 'n'.repeat(20001)
    expect(() => parseProject(JSON.stringify(notes))).toThrow()
  })

  it('rejects the 20,001st element and accepts exactly 20,000', () => {
    const project = createScreenplay()
    project.blocks = Array.from({ length: 20000 }, (_, index) => ({
      id: `b${index}`,
      kind: 'action',
      text: 'x',
    }))
    expect(parseProject(JSON.stringify(project)).blocks).toHaveLength(20000)
    project.blocks.push({ id: 'b20000', kind: 'action', text: 'x' })
    expect(() => parseProject(JSON.stringify(project))).toThrow('between 1 and 20,000')
  })

  it('trims titles but preserves interior whitespace and all other text exactly', () => {
    const project = createScreenplay('  Padded   Title  ')
    project.blocks[0].text = '  leading, trailing  \t and\u00a0nbsp '
    const parsed = parseProject(serializeProject(project))
    expect(parsed.title).toBe('Padded   Title')
    expect(parsed.blocks[0].text).toBe('  leading, trailing  \t and\u00a0nbsp ')
  })

  it('preserves emoji, combining marks, RTL text, and lone surrogates through save and reload', () => {
    const project = createScreenplay('Unicode 🎬')
    project.blocks = [
      makeBlock('action', 'Café naïve — “quotes” 𝒜 日本語 مرحبا 👩🏽‍🚀 e\u0301'),
      makeBlock('dialogue', 'Lone surrogate: \ud800 end'),
    ]
    const reloaded = parseProject(serializeProject(project))
    expect(reloaded.blocks[0].text).toBe(project.blocks[0].text)
    expect(reloaded.blocks[1].text).toBe('Lone surrogate: \ud800 end')
  })

  it('does not accept prototype-polluting note keys or unknown top-level fields silently', () => {
    const project = createScreenplay()
    const text = JSON.stringify(project).replace(/"notes":\{\}/, `"notes":{"__proto__":"x"}`)
    expect(() => parseProject(text)).toThrow()
    const withExtra = parseProject(JSON.stringify({ ...project, injected: 'value' }))
    expect(withExtra).not.toHaveProperty('injected')
  })

  it('normalizes character metrics for cues with extensions and ignores empty cues', () => {
    const blocks = [
      makeBlock('character', "LENA (V.O.) (CONT'D)"),
      makeBlock('dialogue', 'One two three'),
      makeBlock('character', '   '),
      makeBlock('dialogue', 'orphaned'),
      makeBlock('character', 'lena'),
      makeBlock('dialogue', 'four'),
    ]
    expect(getCharacters(blocks)).toEqual([{ name: 'LENA', cues: 2, words: 4 }])
  })

  it('handles scenes without headings, headings with many dashes, and moving edge scenes', () => {
    const project = createScreenplay()
    project.blocks = [
      makeBlock('action', 'Cold open without heading.'),
      makeBlock('scene', 'INT. A - B - NIGHT'),
      makeBlock('action', 'x'),
    ]
    const scenes = getScenes(project.blocks)
    expect(scenes).toHaveLength(1)
    expect(scenes[0]).toMatchObject({ location: 'INT. A - B', time: 'NIGHT', start: 1 })
    expect(moveScene(project, scenes[0].id, -1)).toBe(project)
    expect(moveScene(project, scenes[0].id, 1)).toBe(project)
    expect(moveScene(project, 'missing', 1)).toBe(project)
  })

  it('round-trips Fountain edge cases: empty blocks, parentheses, and lines that look like syntax', () => {
    const project = createScreenplay('Edge cases')
    project.blocks = [
      makeBlock('scene', 'INT. ROOM - DAY'),
      makeBlock('action', ''),
      makeBlock('action', '@not a character'),
      makeBlock('action', '> not a transition'),
      makeBlock('action', '.not a scene'),
      makeBlock('character', 'MARA'),
      makeBlock('parenthetical', 'no parens'),
      makeBlock('dialogue', 'Hello.'),
      makeBlock('transition', 'smash cut to:'),
    ]
    const reimported = importFountain(exportFountain(project))
    const texts = reimported.blocks.map((block) => [block.kind, block.text])
    expect(texts).toEqual([
      ['scene', 'INT. ROOM - DAY'],
      ['action', '@not a character'],
      ['action', '> not a transition'],
      ['action', '.not a scene'],
      ['character', 'MARA'],
      ['parenthetical', '(no parens)'],
      ['dialogue', 'Hello.'],
      ['transition', 'SMASH CUT TO:'],
    ])
  })

  it('refuses Fountain input with no screenplay content and oversized text', () => {
    expect(() => importFountain('')).toThrow('No screenplay text')
    expect(() => importFountain('Title: Only metadata\n')).toThrow('No screenplay text')
    expect(() => importFountain('x'.repeat(5 * 1024 * 1024 + 1))).toThrow('5 MB')
  })

  it('round-trips transitions, orphan cues, bang lines, indented and multi-paragraph action', () => {
    const project = createScreenplay('Round trip')
    project.blocks = [
      makeBlock('scene', 'INT. ROOM - DAY'),
      makeBlock('transition', 'CUT TO:'),
      makeBlock('transition', 'FADE OUT.'),
      makeBlock('transition', 'MATCH DISSOLVE'),
      makeBlock('character', 'MARA'),
      makeBlock('action', 'Cue above has no dialogue.'),
      makeBlock('character', 'LENA'),
      makeBlock('action', '   indented action'),
      makeBlock('action', '!BANG!'),
      makeBlock('action', '! spaced bang'),
      makeBlock('action', 'First line\n!Second line starts with bang\n!!Third with two'),
      makeBlock('action', 'INT. LOOKS LIKE A HEADING'),
      makeBlock('action', 'SHOUTING IN CAPS'),
      makeBlock('action', '==='),
      makeBlock('character', 'BOB'),
      makeBlock('dialogue', 'Line one\nLine two'),
      makeBlock('parenthetical', '(beat)'),
      makeBlock('dialogue', 'YES!'),
    ]
    const reimported = importFountain(exportFountain(project))
    expect(reimported.blocks.map((block) => [block.kind, block.text])).toEqual(
      project.blocks.map((block) => [block.kind, block.text]),
    )
  })

  it('splits action paragraphs at interior blank lines without changing kind or text', () => {
    const project = createScreenplay()
    project.blocks = [makeBlock('action', 'First paragraph\n\nINT. SECOND PARAGRAPH\n   \n>third')]
    const blocks = importFountain(exportFountain(project)).blocks
    expect(blocks.map((block) => block.kind)).toEqual(['action', 'action', 'action'])
    expect(blocks.map((block) => block.text)).toEqual(['First paragraph', 'INT. SECOND PARAGRAPH', '>third'])
  })

  it('pins the documented Fountain losses so they cannot change silently', () => {
    const project = createScreenplay()
    project.blocks = [
      makeBlock('scene', 'INT. MULTI\nLINE - DAY'),
      makeBlock('parenthetical', '(standalone beat)'),
      makeBlock('character', 'MARA'),
      makeBlock('dialogue', 'Before blank\n\nAfter blank'),
      makeBlock('shot', 'CLOSE ON THE LETTER'),
    ]
    const blocks = importFountain(exportFountain(project)).blocks.map((block) => [block.kind, block.text])
    expect(blocks).toEqual([
      ['scene', 'INT. MULTI LINE - DAY'],
      ['action', '(standalone beat)'],
      ['character', 'MARA'],
      ['dialogue', 'Before blank'],
      ['action', 'After blank'],
      ['action', 'CLOSE ON THE LETTER'],
    ])
  })

  it('fuzzes expressible screenplays through Fountain without losing kinds, order, or text', () => {
    let seed = 20260914
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]
    const words = [
      'quiet',
      'TRAIN',
      'café',
      "don't",
      '#hash',
      '~tilde',
      '=eq',
      '@at',
      '.dot',
      '>gt',
      '!bang',
      '*star*',
      '_under_',
      '[[note]]',
      '日本',
      '🎬',
      'x'.repeat(70),
    ]
    const phrase = (max: number) =>
      Array.from({ length: 1 + Math.floor(random() * max) }, () => pick(words)).join(' ')
    for (let round = 0; round < 150; round += 1) {
      const blocks: ReturnType<typeof makeBlock>[] = [makeBlock('scene', `INT. ${phrase(3)} - DAY`)]
      const count = 1 + Math.floor(random() * 12)
      for (let index = 0; index < count; index += 1) {
        const kind = pick(['action', 'action', 'character', 'transition', 'scene'] as const)
        if (kind === 'character') {
          blocks.push(makeBlock('character', phrase(2)))
          if (random() < 0.5) blocks.push(makeBlock('parenthetical', `(${phrase(2)})`))
          blocks.push(makeBlock('dialogue', random() < 0.3 ? `${phrase(4)}\n${phrase(4)}` : phrase(5)))
          if (random() < 0.3) {
            blocks.push(makeBlock('parenthetical', `(${phrase(1)})`))
            blocks.push(makeBlock('dialogue', phrase(3)))
          }
        } else if (kind === 'transition')
          blocks.push(makeBlock('transition', random() < 0.5 ? `${phrase(2)} TO:` : phrase(2)))
        else if (kind === 'scene') blocks.push(makeBlock('scene', `EXT. ${phrase(2)} - NIGHT`))
        else blocks.push(makeBlock('action', random() < 0.3 ? `${phrase(6)}\n${phrase(6)}` : phrase(8)))
      }
      const project = createScreenplay(`Fuzz ${round}`)
      project.blocks = blocks
      const reimported = importFountain(exportFountain(project))
      expect(
        reimported.blocks.map((block) => [block.kind, block.text]),
        `round ${round}`,
      ).toEqual(blocks.map((block) => [block.kind, block.text]))
    }
  })

  it('produces safe filenames for reserved characters, dots, control codes, and blank titles', () => {
    expect(fileName('  ')).toBe('Untitled screenplay')
    expect(fileName('...')).toBe('Untitled screenplay')
    expect(fileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(fileName('Trailing dots and spaces... ')).toBe('Trailing dots and spaces')
    expect(fileName(`tab\tand\u0007bell`)).toBe('tabandbell')
    expect(fileName('x'.repeat(250))).toHaveLength(100)
  })

  it('validateScreenplay output is always re-validatable (idempotent)', () => {
    const project = createScreenplay('  Idempotent ')
    const once = validateScreenplay(project)
    expect(validateScreenplay(once)).toEqual(once)
  })
})

describe('artwork validation boundaries', () => {
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ])
  function png(width: number, height: number, payload = 64) {
    const dims = Buffer.alloc(8)
    dims.writeUInt32BE(width, 0)
    dims.writeUInt32BE(height, 4)
    return `data:image/png;base64,${Buffer.concat([header, dims, Buffer.alloc(payload)]).toString('base64')}`
  }

  it('accepts a real PNG and rejects mismatches, non-integers, and dimension overflow', () => {
    const actual = readFileSync(new URL('../../public/icon.png', import.meta.url))
    expect(
      validateArtwork({
        name: 'ok.png',
        dataUrl: `data:image/png;base64,${actual.toString('base64')}`,
        width: 512,
        height: 512,
      }),
    ).toMatchObject({ width: 512, height: 512 })
    expect(() => validateArtwork({ name: 'ok.png', dataUrl: png(10, 20), width: 20, height: 10 })).toThrow(
      'PNG dimensions',
    )
    expect(() => validateArtwork({ name: 'ok.png', dataUrl: png(10, 20), width: 10.5, height: 20 })).toThrow(
      'metadata',
    )
    expect(() => validateArtwork({ name: 'ok.png', dataUrl: png(1601, 1), width: 1601, height: 1 })).toThrow(
      'metadata',
    )
    expect(() => validateArtwork({ name: 'ok.png', dataUrl: png(0, 1), width: 0, height: 1 })).toThrow(
      'metadata',
    )
    expect(() => validateArtwork({ name: '', dataUrl: png(1, 1), width: 1, height: 1 })).toThrow('metadata')
    expect(() => validateArtwork({ name: 'x'.repeat(201), dataUrl: png(1, 1), width: 1, height: 1 })).toThrow(
      'metadata',
    )
  })

  it('rejects jpeg data urls, whitespace in base64, and payloads above 1.5 MB', () => {
    expect(() =>
      validateArtwork({ name: 'a.jpg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', width: 1, height: 1 }),
    ).toThrow('metadata')
    expect(() => validateArtwork({ name: 'a.png', dataUrl: `${png(1, 1)}\n`, width: 1, height: 1 })).toThrow(
      'embedded PNG',
    )
    expect(() =>
      validateArtwork({ name: 'a.png', dataUrl: png(1, 1, 1500001), width: 1, height: 1 }),
    ).toThrow('embedded PNG')
  })

  it('does not throw on a truncated header shorter than the IHDR chunk', () => {
    const tiny = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`
    expect(() => validateArtwork({ name: 'a.png', dataUrl: tiny, width: 1, height: 1 })).toThrow(
      'embedded PNG',
    )
  })
})

describe('reopen reconciliation edge cases', () => {
  it('prefers disk when the recovery draft is not strictly newer', () => {
    const disk = { ...createScreenplay(), updatedAt: '2026-09-14T10:00:00Z' }
    const equal = { ...disk, title: 'Different title' }
    expect(chooseReopenedDraft(equal, disk, false).project).toBe(disk)
    const older = { ...disk, title: 'Different title', updatedAt: '2026-09-14T09:00:00Z' }
    expect(chooseReopenedDraft(older, disk, false)).toEqual({
      project: disk,
      recovered: false,
      preserveRecovery: true,
    })
  })

  it('reports nothing to preserve when recovery and disk are identical', () => {
    const disk = createScreenplay()
    expect(chooseReopenedDraft({ ...disk }, disk, true)).toEqual({
      project: disk,
      recovered: false,
      preserveRecovery: false,
    })
  })
})

describe('layout robustness', () => {
  it('wraps unbroken 100k-character words and giant paragraphs without hanging', () => {
    const start = performance.now()
    const lines = wrapText('x'.repeat(100000), 60)
    expect(lines).toHaveLength(Math.ceil(100000 / 60))
    expect(lines.every((line) => line.text.length <= 60)).toBe(true)
    const layout = paginate([makeBlock('action', 'x'.repeat(100000))])
    expect(layout.pageCount).toBe(Math.ceil(lines.length / 54))
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('never splits a surrogate pair and never produces a line wider than its column budget', () => {
    const text = '👩🏽‍🚀'.repeat(200)
    for (const line of wrapText(text, 13)) {
      expect(line.text.length).toBeLessThanOrEqual(13)
      expect(/^[\ud800-\udbff]$/.test(line.text.slice(-1))).toBe(false)
    }
  })

  it('places a dialogue block that is exactly one page long without an empty marker page', () => {
    const rowsAfterCue = 54 - 1
    const dialogue = makeBlock('dialogue', Array(rowsAfterCue).fill('Line.').join('\n'))
    const layout = paginate([makeBlock('character', 'MARA'), dialogue])
    expect(layout.pageCount).toBe(1)
    expect(layout.parts.filter((part) => part.marker)).toHaveLength(0)
  })

  it('keeps every part inside the page and every marker on a real page', () => {
    const blocks = Array.from({ length: 300 }, (_, index) =>
      makeBlock(
        (['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot'] as const)[
          index % 7
        ],
        index % 5 === 0
          ? 'A much longer element that will wrap over several lines to stress the page layout logic. '.repeat(
              3,
            )
          : `Element ${index}`,
      ),
    )
    for (const size of ['letter', 'a4'] as const) {
      const layout = paginate(blocks, size)
      const rows = size === 'a4' ? 58 : 54
      for (const part of layout.parts) {
        expect(part.row).toBeGreaterThanOrEqual(0)
        expect(part.row + part.lines.length).toBeLessThanOrEqual(rows)
        expect(part.page).toBeLessThan(layout.pageCount)
      }
    }
  })
})
