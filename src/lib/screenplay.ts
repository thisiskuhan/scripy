import { Fountain } from 'fountain-js'
import { PAPER_SIZES, type PaperSize } from './paper'
import { validateArtwork, type TitleArtwork } from './artwork'

export const ELEMENTS = [
  'scene',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
  'shot',
] as const
export type ElementKind = (typeof ELEMENTS)[number]

export const ELEMENT_LABELS: Record<ElementKind, string> = {
  scene: 'Scene heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
}

export interface ScriptBlock {
  id: string
  kind: ElementKind
  text: string
}

export interface Screenplay {
  version: 2
  id: string
  title: string
  author: string
  draft: string
  logline: string
  createdAt: string
  updatedAt: string
  blocks: ScriptBlock[]
  notes: Record<string, string>
  paperSize: PaperSize
  titleArtwork: TitleArtwork | null
}

export interface Scene {
  id: string
  number: number
  heading: string
  location: string
  time: string
  start: number
  end: number
  words: number
  preview: string
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024

export function makeBlock(kind: ElementKind, text = ''): ScriptBlock {
  return { id: crypto.randomUUID(), kind, text: normalizeText(kind, text) }
}

export function normalizeText(kind: ElementKind, text: string): string {
  return ['scene', 'character', 'transition', 'shot'].includes(kind) ? text.toUpperCase() : text
}

export function createScreenplay(title = 'Untitled screenplay'): Screenplay {
  const now = new Date().toISOString()
  return {
    version: 2,
    id: crypto.randomUUID(),
    title,
    author: '',
    draft: 'First draft',
    logline: '',
    createdAt: now,
    updatedAt: now,
    blocks: [makeBlock('scene')],
    notes: {},
    paperSize: 'letter',
    titleArtwork: null,
  }
}

export function nextElement(kind: ElementKind, empty = false): ElementKind {
  if (empty) return kind === 'action' ? 'scene' : 'action'
  if (kind === 'character' || kind === 'parenthetical') return 'dialogue'
  if (kind === 'transition') return 'scene'
  return 'action'
}

export function cycleElement(kind: ElementKind, backwards = false): ElementKind {
  const sequence: ElementKind[] = [
    'action',
    'character',
    'dialogue',
    'parenthetical',
    'transition',
    'scene',
    'shot',
  ]
  return sequence[(sequence.indexOf(kind) + (backwards ? sequence.length - 1 : 1)) % sequence.length]
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function getScenes(blocks: ScriptBlock[]): Scene[] {
  const headings = blocks.flatMap((block, index) => (block.kind === 'scene' ? [index] : []))
  return headings.map((start, index) => {
    const block = blocks[start]
    const end = headings[index + 1] ?? blocks.length
    const content = blocks.slice(start + 1, end)
    const heading = block.text || 'Untitled scene'
    const parts = heading.split(/\s+-\s+/)
    return {
      id: block.id,
      number: index + 1,
      heading,
      location: parts.slice(0, parts.length > 1 ? -1 : undefined).join(' - '),
      time: parts.length > 1 ? parts[parts.length - 1] : '',
      start,
      end,
      words: content.reduce((total, item) => total + wordCount(item.text), 0),
      preview: content.find((item) => item.kind === 'action' && item.text.trim())?.text ?? '',
    }
  })
}

export function getCharacters(blocks: ScriptBlock[]): { name: string; cues: number; words: number }[] {
  const characters = new Map<string, { name: string; cues: number; words: number }>()
  let current = ''
  for (const block of blocks) {
    if (block.kind === 'character') {
      current = block.text.replace(/\s*\([^)]*\)/g, '').trim()
      if (!current) continue
      const character = characters.get(current) ?? { name: current, cues: 0, words: 0 }
      character.cues += 1
      characters.set(current, character)
    } else if (block.kind === 'dialogue' && current) {
      const character = characters.get(current)
      if (character) character.words += wordCount(block.text)
    } else if (block.kind !== 'parenthetical') {
      current = ''
    }
  }
  return [...characters.values()].sort(
    (first, second) => second.cues - first.cues || first.name.localeCompare(second.name),
  )
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

export function validateScreenplay(value: unknown): Screenplay {
  if (!record(value) || (value.version !== 1 && value.version !== 2))
    throw new Error('This is not a supported Scripy document (versions 1 and 2).')
  if (
    !validString(value.id, 100) ||
    !/^[\w-]+$/.test(value.id) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, value.id) ||
    !validString(value.title, 300) ||
    !value.title.trim() ||
    !validString(value.author, 300) ||
    !validString(value.draft, 100) ||
    !validString(value.logline, 5000) ||
    !validString(value.createdAt, 50) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !validString(value.updatedAt, 50) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new Error('The document information is incomplete or invalid.')
  }
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > 20000) {
    throw new Error('The document must contain between 1 and 20,000 elements.')
  }
  const ids = new Set<string>()
  const blocks = value.blocks.map((item: unknown) => {
    if (
      !record(item) ||
      !validString(item.id, 100) ||
      !/^[\w-]+$/.test(item.id) ||
      Object.prototype.hasOwnProperty.call(Object.prototype, item.id) ||
      ids.has(item.id) ||
      !ELEMENTS.includes(item.kind as ElementKind) ||
      !validString(item.text, 100000)
    ) {
      throw new Error('The document contains an invalid or duplicate screenplay element.')
    }
    ids.add(item.id)
    return { id: item.id, kind: item.kind as ElementKind, text: item.text }
  })
  if (!record(value.notes)) throw new Error('The document notes are invalid.')
  const notes: Record<string, string> = {}
  for (const [key, note] of Object.entries(value.notes)) {
    if (!ids.has(key) || !validString(note, 20000))
      throw new Error('The document contains an invalid scene note.')
    notes[key] = note
  }
  const paperSize = value.version === 1 ? 'letter' : value.paperSize
  if (!PAPER_SIZES.includes(paperSize as PaperSize))
    throw new Error('Choose a supported paper size: US Letter or A4.')
  const titleArtwork = value.version === 1 ? null : validateArtwork(value.titleArtwork)
  return {
    version: 2,
    id: value.id,
    title: value.title.trim(),
    author: value.author,
    draft: value.draft,
    logline: value.logline,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    blocks,
    notes,
    paperSize: paperSize as PaperSize,
    titleArtwork,
  }
}

export function parseProject(text: string): Screenplay {
  if (new Blob([text]).size > MAX_FILE_BYTES) throw new Error('This file exceeds the 5 MB document limit.')
  try {
    return validateScreenplay(JSON.parse(text.replace(/^\uFEFF/, '')))
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error('This file is not valid JSON. Open a .scripy or .fountain file.')
    throw error
  }
}

export function serializeProject(project: Screenplay): string {
  const content = JSON.stringify(validateScreenplay(project), null, 2)
  if (new Blob([content]).size > MAX_FILE_BYTES)
    throw new Error(
      'This document exceeds the 5 MB limit. Reduce the title image or split the screenplay before saving.',
    )
  return content
}

export function importFountain(text: string, fallbackTitle = 'Imported screenplay'): Screenplay {
  if (new Blob([text]).size > MAX_FILE_BYTES) throw new Error('This file exceeds the 5 MB document limit.')
  const parsed = new Fountain().parse(text.replace(/^\uFEFF/, ''), true)
  const kinds: Record<string, ElementKind> = {
    scene_heading: 'scene',
    action: 'action',
    character: 'character',
    dialogue: 'dialogue',
    parenthetical: 'parenthetical',
    transition: 'transition',
    centered: 'action',
  }
  let inDialogue = false
  const blocks = parsed.tokens.flatMap((token) => {
    if (token.type === 'dialogue_begin') inDialogue = true
    if (token.type === 'dialogue_end') inDialogue = false
    const kind = token.type === 'lyrics' ? (inDialogue ? 'dialogue' : 'action') : kinds[token.type]
    if (!kind || typeof token.text !== 'string') return []
    if (token.type === 'dialogue' && token.text.trim() === EMPTY_DIALOGUE_MARKER) return []
    const text =
      token.type === 'transition' && NATURAL_TRANSITION.test(token.text)
        ? token.text.replace(/^>\s*/, '')
        : token.type === 'dialogue'
          ? token.text.replace(/\\([\\~])/g, '$1')
          : token.text.replace(/<br\s*\/?\s*>/gi, '\n')
    return [makeBlock(kind, text)]
  })
  if (!blocks.length) throw new Error('No screenplay text was found in this Fountain file.')
  const title = parsed.tokens.find((token) => token.type === 'title')?.text?.trim()
  const author =
    parsed.tokens.find((token) => token.type === 'author' || token.type === 'authors')?.text?.trim() ?? ''
  return validateScreenplay({ ...createScreenplay(title || fallbackTitle), author, blocks })
}

// fountain-js keeps the '>' when an uppercase forced transition also matches its natural rule.
const NATURAL_TRANSITION = /^\s*((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO:)[^\S\n]*$/
// Fountain has no orphan character cue; other tools treat [[...]] as a non-printing note.
const EMPTY_DIALOGUE_MARKER = '[[Scripy: no dialogue]]'

function isBlankFountainLine(line: string): boolean {
  return /^[^\S\n]*$/.test(line) && line !== '  '
}

// Each paragraph gets a '!' marker; continuation lines double a leading '!' so the parser's per-line strip restores it.
function forcedAction(text: string): string {
  let paragraphStart = true
  return text
    .split('\n')
    .map((line) => {
      const output = paragraphStart ? line.replace(/^(\s*)/, '$1!') : line.replace(/^(\s*)!(?! )/, '$1!!')
      paragraphStart = isBlankFountainLine(line)
      return output
    })
    .join('\n')
}

export function exportFountain(project: Screenplay): string {
  const header = [
    `Title: ${project.title.replace(/\n/g, ' ')}`,
    project.author.trim() ? `Author: ${project.author.replace(/\n/g, ' ')}` : '',
    project.draft.trim() ? `Draft date: ${project.draft.replace(/\n/g, ' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  let output = `${header}\n\n`
  let previous: ElementKind | null = null
  const blocks = project.blocks.filter((block) => block.text.trim())
  for (const [index, block] of blocks.entries()) {
    const text = normalizeText(block.kind, block.text)
    const singleLine = text.replace(/\s*\n\s*/g, ' ').trim()
    const connected =
      (block.kind === 'dialogue' || block.kind === 'parenthetical') &&
      (previous === 'character' || previous === 'dialogue' || previous === 'parenthetical')
    if (previous) output += connected ? '\n' : '\n\n'
    if (block.kind === 'scene') output += `.${singleLine}`
    else if (block.kind === 'character') {
      const next = blocks[index + 1]?.kind
      output += `@${singleLine}`
      if (next !== 'dialogue' && next !== 'parenthetical') output += `\n${EMPTY_DIALOGUE_MARKER}`
    } else if (block.kind === 'transition') output += `> ${singleLine}`
    else if (block.kind === 'action' || block.kind === 'shot') output += forcedAction(text)
    else if (block.kind === 'parenthetical') output += text.startsWith('(') ? text : `(${text})`
    else output += text.replace(/\\/g, '\\\\').replace(/^~/gm, '\\~')
    previous = block.kind
  }
  return `${output}\n`
}

export function moveScene(project: Screenplay, sceneId: string, direction: -1 | 1): Screenplay {
  const scenes = getScenes(project.blocks)
  const index = scenes.findIndex((scene) => scene.id === sceneId)
  const target = scenes[index + direction]
  const source = scenes[index]
  if (!source || !target) return project
  const blocks = [...project.blocks]
  const section = blocks.splice(source.start, source.end - source.start)
  const destination = direction < 0 ? target.start : target.end - section.length
  blocks.splice(destination, 0, ...section)
  return { ...project, blocks, updatedAt: new Date().toISOString() }
}

export function fileName(title: string): string {
  return (
    [...title]
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .replace(/[<>:"/\\|?*]/g, '')
      .trim()
      .slice(0, 100)
      .replace(/[. ]+$/, '') || 'Untitled screenplay'
  )
}

export function scripyFileName(title: string, savedAt = new Date()): string {
  const timestamp = savedAt.toISOString().replace('T', '_').replace(/[:.]/g, '-')
  return `${fileName(title)}_${timestamp}.scripy`
}
