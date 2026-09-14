import { describe, expect, it } from 'vitest'
import { createScreenplay, parseProject, serializeProject } from './screenplay'
import { readFileSync } from 'node:fs'
import { validateArtwork } from './artwork'

describe('portable Scripy document format', () => {
  it('migrates version-1 files without changing screenplay IDs, text, or notes', () => {
    const original = createScreenplay('An older draft')
    original.notes[original.blocks[0].id] = 'A note to preserve.'
    const legacy = { ...original, version: 1, paperSize: undefined, titleArtwork: undefined }
    const migrated = parseProject(JSON.stringify(legacy))
    expect(migrated).toEqual({ ...original, version: 2, paperSize: 'letter', titleArtwork: null })
  })

  it('round-trips A4 and embedded title artwork separately from script elements', () => {
    const project = createScreenplay('An illustrated title page')
    const image = readFileSync(new URL('../../public/icon.png', import.meta.url))
    const dataUrl = `data:image/png;base64,${image.toString('base64')}`
    project.paperSize = 'a4'
    project.titleArtwork = { name: 'icon.png', dataUrl, width: 512, height: 512 }
    expect(parseProject(serializeProject(project))).toEqual(project)
    expect(project.blocks.every((block) => block.kind !== ('image' as string))).toBe(true)
  })

  it('rejects unsupported paper sizes, remote images, and forged image dimensions', () => {
    const project = createScreenplay()
    expect(() => parseProject(JSON.stringify({ ...project, paperSize: 'legal' }))).toThrow('paper size')
    expect(() =>
      validateArtwork({ name: 'Remote', dataUrl: 'https://example.com/image.png', width: 100, height: 100 }),
    ).toThrow('metadata is invalid')
    const image = readFileSync(new URL('../../public/icon.png', import.meta.url))
    expect(() =>
      validateArtwork({
        name: 'Wrong dimensions',
        dataUrl: `data:image/png;base64,${image.toString('base64')}`,
        width: 1,
        height: 1,
      }),
    ).toThrow('PNG dimensions')
    expect(() =>
      parseProject(JSON.stringify({ ...project, blocks: [{ ...project.blocks[0], kind: 'image' }] })),
    ).toThrow('invalid or duplicate')
  })
  it('opens UTF-8 files with a byte order mark', () => {
    const project = createScreenplay('A portable draft')
    expect(parseProject(`\uFEFF${serializeProject(project)}`)).toEqual(project)
  })

  it('rejects project identifiers the native file layer cannot bind', () => {
    const project = { ...createScreenplay(), id: 'invalid path/id' }
    expect(() => parseProject(JSON.stringify(project))).toThrow('information is incomplete or invalid')
  })

  it('rejects element identifiers that collide with inherited note properties', () => {
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const project = createScreenplay('An imported draft')
      project.blocks[0].id = id
      expect(() => parseProject(JSON.stringify(project))).toThrow('invalid or duplicate screenplay element')
    }
  })
})
