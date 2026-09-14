import { describe, expect, it } from 'vitest'
import {
  createScreenplay,
  cycleElement,
  exportFountain,
  fileName,
  getCharacters,
  getScenes,
  importFountain,
  makeBlock,
  moveScene,
  nextElement,
  parseProject,
  serializeProject,
  scripyFileName,
} from './screenplay'

describe('screenplay filenames', () => {
  it('adds a filesystem-safe UTC timestamp without changing the title', () => {
    expect(scripyFileName('The Quiet Hours', new Date('2026-09-14T12:34:56.789Z'))).toBe(
      'The Quiet Hours_2026-09-14_12-34-56-789Z.scripy',
    )
    expect(fileName('The Quiet Hours')).toBe('The Quiet Hours')
  })

  it('sanitizes the title and keeps a valid fallback for an empty filename', () => {
    const savedAt = new Date('2026-09-14T12:34:56.789Z')
    expect(scripyFileName('Scene: One/Two?. ', savedAt)).toBe('Scene OneTwo_2026-09-14_12-34-56-789Z.scripy')
    expect(scripyFileName(' /?* ', savedAt)).toBe('Untitled screenplay_2026-09-14_12-34-56-789Z.scripy')
  })

  it('uses the current date when no timestamp is supplied', () => {
    expect(scripyFileName('Draft')).toMatch(/^Draft_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z\.scripy$/)
  })
})

describe('screenplay editing rules', () => {
  it('follows character and parenthetical cues with dialogue', () => {
    expect(nextElement('character')).toBe('dialogue')
    expect(nextElement('parenthetical')).toBe('dialogue')
    expect(nextElement('dialogue')).toBe('action')
    expect(nextElement('transition')).toBe('scene')
    expect(nextElement('dialogue', true)).toBe('action')
  })

  it('cycles element types in either direction', () => {
    expect(cycleElement('action')).toBe('character')
    expect(cycleElement('character', true)).toBe('action')
    expect(cycleElement('action', true)).toBe('shot')
  })

  it('round-trips project files including notes and identifiers', () => {
    const project = createScreenplay('The Last Light')
    project.notes[project.blocks[0].id] = 'Keep this moment quiet.'
    expect(parseProject(serializeProject(project))).toEqual(project)
  })

  it('rejects invalid versions, duplicate identifiers and malformed files', () => {
    const project = createScreenplay()
    expect(() => parseProject('{')).toThrow('not valid JSON')
    expect(() => parseProject(JSON.stringify({ ...project, version: 12 }))).toThrow('not a supported')
    expect(() =>
      parseProject(JSON.stringify({ ...project, blocks: [project.blocks[0], project.blocks[0]] })),
    ).toThrow('duplicate')
    expect(() => parseProject(JSON.stringify({ ...project, blocks: [] }))).toThrow('between 1')
    expect(() => parseProject(JSON.stringify({ ...project, notes: { missing: 'note' } }))).toThrow(
      'invalid scene note',
    )
  })

  it('imports and exports Fountain without interpreting text as HTML', () => {
    const project = importFountain(
      'Title: The Last Light\nAuthor: Alex Morgan\n\nEXT. PIER - DAWN\n\nA quiet sea.\n\nMARA\n(softly)\nWe made it.\n\n> FADE OUT.\n',
    )
    expect(project.title).toBe('The Last Light')
    expect(project.author).toBe('Alex Morgan')
    expect(project.blocks.map((block) => block.kind)).toEqual([
      'scene',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
    ])
    const imported = importFountain(exportFountain(project))
    expect(imported.blocks.map(({ kind, text }) => ({ kind, text }))).toEqual(
      project.blocks.map(({ kind, text }) => ({ kind, text })),
    )
  })

  it('keeps uppercase action as action through Fountain interchange', () => {
    const project = createScreenplay()
    project.blocks = [
      makeBlock('action', 'THE LIGHT GOES OUT.'),
      makeBlock('action', '<script>alert(1)</script>'),
    ]
    expect(importFountain(exportFountain(project)).blocks.map((block) => block.kind)).toEqual([
      'action',
      'action',
    ])
    expect(importFountain(exportFountain(project)).blocks[1].text).toContain('<script>')
  })

  it('reorders complete scenes without detaching their notes', () => {
    const project = createScreenplay()
    project.blocks = [
      makeBlock('scene', 'INT. CAFE - DAY'),
      makeBlock('action', 'A cup cools.'),
      makeBlock('scene', 'EXT. PIER - NIGHT'),
      makeBlock('action', 'Waves roll in.'),
    ]
    project.notes[project.blocks[0].id] = 'Opening scene'
    const moved = moveScene(project, project.blocks[0].id, 1)
    expect(moved.blocks.map((block) => block.text)).toEqual([
      'EXT. PIER - NIGHT',
      'Waves roll in.',
      'INT. CAFE - DAY',
      'A cup cools.',
    ])
    expect(moved.notes).toEqual(project.notes)
    expect(moveScene(moved, project.blocks[0].id, -1).blocks).toEqual(project.blocks)
    expect(getScenes(project.blocks)[1]).toMatchObject({ number: 2, time: 'NIGHT', words: 3 })
  })

  it('counts dialogue for the correct characters only', () => {
    const blocks = [
      makeBlock('character', 'MARA (V.O.)'),
      makeBlock('dialogue', 'A new day.'),
      makeBlock('action', 'She leaves.'),
      makeBlock('dialogue', 'Not attributed.'),
      makeBlock('character', 'MARA'),
      makeBlock('dialogue', 'At last.'),
    ]
    expect(getCharacters(blocks)).toEqual([{ name: 'MARA', cues: 2, words: 5 }])
  })
})
