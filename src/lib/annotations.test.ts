import { describe, expect, it } from 'vitest'
import { createScreenplay, getScenes, parseProject, serializeProject } from './screenplay'
import {
  filterPassageNotes,
  normalizeTag,
  passageText,
  validatePassageNotes,
  type NoteFilters,
  type PassageNote,
} from './annotations'

function fixture() {
  const project = createScreenplay()
  project.blocks[0].text = 'The sleeping streets.'
  const note: PassageNote = {
    id: crypto.randomUUID(),
    quote: 'sleeping',
    text: 'Let the traffic fade into a low musical pulse.',
    departments: ['Sound', 'Music', 'Cinematography'],
    tags: ['general', 'camera'],
    resolved: false,
    ranges: [{ blockId: project.blocks[0].id, from: 4, to: 12 }],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
  return { project, note }
}

describe('passage note storage', () => {
  it('combines any selected department with every selected tag, scene, search, and status', () => {
    const { project, note } = fixture()
    const other = {
      ...note,
      id: 'other',
      tags: ['general'],
      departments: ['Editing'] as PassageNote['departments'],
      resolved: true,
    }
    const filters: NoteFilters = {
      query: '',
      departments: [],
      tags: [],
      status: 'all',
      sceneId: '',
      sort: 'recent',
    }
    const select = (change: Partial<NoteFilters>) =>
      filterPassageNotes([note, other], project.blocks, getScenes(project.blocks), {
        ...filters,
        ...change,
      }).map((item) => item.id)
    expect(select({ departments: ['Sound', 'Editing'] })).toEqual([note.id, other.id])
    expect(
      select({
        departments: ['Sound'],
        tags: ['general', 'camera'],
        query: 'sleeping',
        sceneId: project.blocks[0].id,
      }),
    ).toEqual([note.id])
    expect(select({ status: 'resolved' })).toEqual([other.id])
    expect(select({ status: 'detached' })).toEqual([])
    expect(select({ tags: ['missing'] })).toEqual([])
    expect(select({ sceneId: 'another-scene' })).toEqual([])
  })
  it('retains multiple departments, tags, and the selected passage', () => {
    const { project, note } = fixture()
    expect(validatePassageNotes([note], project.blocks)).toEqual([note])
    expect(passageText(note, project.blocks)).toBe('sleeping')
    project.annotations = [note]
    expect(parseProject(serializeProject(project))).toEqual(project)
  })
  it('keeps notes and their original quote after text removal', () => {
    const { project, note } = fixture()
    note.ranges = []
    expect(validatePassageNotes([note], project.blocks)).toEqual([note])
    expect(passageText(note, [])).toBe('sleeping')
  })
  it('normalizes tag spelling and removes duplicate tags', () => {
    const { project, note } = fixture()
    expect(normalizeTag('  Camera   Movement ')).toBe('camera movement')
    expect(validatePassageNotes([{ ...note, tags: ['Camera', ' camera '] }], project.blocks)[0].tags).toEqual(
      ['camera'],
    )
  })
  it('accepts custom departments and collapses their whitespace and duplicates', () => {
    const { project, note } = fixture()
    expect(
      validatePassageNotes(
        [{ ...note, departments: ['Sound', '  Aerial  Unit ', 'Aerial Unit'] }],
        project.blocks,
      )[0].departments,
    ).toEqual(['Sound', 'Aerial Unit'])
  })
  it('rejects invalid ranges, duplicate IDs, and malformed note metadata', () => {
    const { project, note } = fixture()
    for (const ranges of [
      [{ blockId: 'missing', from: 0, to: 1 }],
      [{ blockId: project.blocks[0].id, from: -1, to: 3 }],
      [{ blockId: project.blocks[0].id, from: 1, to: 100 }],
    ])
      expect(() => validatePassageNotes([{ ...note, ranges }], project.blocks)).toThrow('outside')
    expect(() => validatePassageNotes([note, note], project.blocks)).toThrow('duplicate')
    for (const change of [
      { text: ' ' },
      { departments: [''] },
      { tags: ['x'.repeat(41)] },
      { updatedAt: 'bad' },
      { id: '__proto__' },
    ])
      expect(() => validatePassageNotes([{ ...note, ...change }], project.blocks)).toThrow('invalid')
  })
})
