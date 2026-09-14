import type { Scene, ScriptBlock } from './screenplay'

export const DEPARTMENTS = [
  'Direction',
  'Production',
  'Writing',
  'Cinematography',
  'Camera',
  'Lighting',
  'Grip',
  'Sound',
  'Music',
  'Art',
  'Props',
  'Costume',
  'Hair & Makeup',
  'Stunts',
  'VFX',
  'Editing',
  'Locations',
] as const
export type Department = string
export const MAX_DEPARTMENTS = 30

export function normalizeDepartment(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export const SUGGESTED_TAGS = [
  'general',
  'camera',
  'ambience',
  'continuity',
  'dialogue',
  'lighting',
  'performance',
  'props',
]

export interface NoteRange {
  blockId: string
  from: number
  to: number
}

export interface PassageNote {
  id: string
  quote: string
  text: string
  departments: Department[]
  tags: string[]
  resolved: boolean
  ranges: NoteRange[]
  createdAt: string
  updatedAt: string
}

export interface PassageSelection {
  quote: string
  ranges: NoteRange[]
}

export function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\w-]{1,100}$/.test(value) &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, value)
  )
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max
}

export function validatePassageNotes(value: unknown, blocks: ScriptBlock[]): PassageNote[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error('The passage notes are invalid or exceed the 2,000-note limit.')
  const blockLengths = new Map(blocks.map((block) => [block.id, block.text.length]))
  const ids = new Set<string>()
  return value.map((note: unknown) => {
    if (
      !record(note) ||
      !validId(note.id) ||
      ids.has(note.id) ||
      !text(note.quote, 20000) ||
      !text(note.text, 20000) ||
      typeof note.resolved !== 'boolean' ||
      !Array.isArray(note.departments) ||
      note.departments.length > MAX_DEPARTMENTS ||
      note.departments.some(
        (item) =>
          typeof item !== 'string' || !normalizeDepartment(item) || normalizeDepartment(item).length > 40,
      ) ||
      !Array.isArray(note.tags) ||
      note.tags.length > 12 ||
      note.tags.some((tag) => !text(tag, 40)) ||
      !Array.isArray(note.ranges) ||
      note.ranges.length > 200 ||
      !text(note.createdAt, 50) ||
      !Number.isFinite(Date.parse(note.createdAt)) ||
      !text(note.updatedAt, 50) ||
      !Number.isFinite(Date.parse(note.updatedAt))
    )
      throw new Error('The document contains an invalid or duplicate passage note.')
    ids.add(note.id)
    const ranges = note.ranges.map((range: unknown) => {
      if (
        !record(range) ||
        !validId(range.blockId) ||
        !blockLengths.has(range.blockId) ||
        !Number.isSafeInteger(range.from) ||
        !Number.isSafeInteger(range.to) ||
        (range.from as number) < 0 ||
        (range.to as number) <= (range.from as number) ||
        (range.to as number) > blockLengths.get(range.blockId)!
      )
        throw new Error('A passage note points outside its screenplay text.')
      return { blockId: range.blockId, from: range.from as number, to: range.to as number }
    })
    return {
      id: note.id,
      quote: note.quote,
      text: note.text,
      departments: [...new Set((note.departments as string[]).map(normalizeDepartment))],
      tags: [...new Set((note.tags as string[]).map(normalizeTag))],
      resolved: note.resolved,
      ranges,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }
  })
}

export function passageText(note: PassageNote, blocks: ScriptBlock[]): string {
  const byId = new Map(blocks.map((block) => [block.id, block.text]))
  return (
    note.ranges.map((range) => byId.get(range.blockId)?.slice(range.from, range.to) ?? '').join('\n') ||
    note.quote
  )
}

export interface NoteFilters {
  query: string
  departments: Department[]
  tags: string[]
  status: 'all' | 'open' | 'resolved' | 'detached'
  sceneId: string
  sort: 'recent' | 'scene'
}

export function filterPassageNotes(
  notes: PassageNote[],
  blocks: ScriptBlock[],
  scenes: Scene[],
  filters: NoteFilters,
): PassageNote[] {
  const indices = new Map(blocks.map((block, index) => [block.id, index]))
  const scene = scenes.find((item) => item.id === filters.sceneId)
  const query = filters.query.trim().toLowerCase()
  const result = notes.filter((note) => {
    if (
      filters.departments.length &&
      !filters.departments.some((department) => note.departments.includes(department))
    )
      return false
    if (!filters.tags.every((tag) => note.tags.includes(tag))) return false
    if (
      (filters.status === 'open' && note.resolved) ||
      (filters.status === 'resolved' && !note.resolved) ||
      (filters.status === 'detached' && note.ranges.length)
    )
      return false
    if (
      filters.sceneId &&
      (!scene ||
        !note.ranges.some((range) => {
          const index = indices.get(range.blockId) ?? -1
          return index >= scene.start && index < scene.end
        }))
    )
      return false
    return (
      !query ||
      [note.text, note.quote, passageText(note, blocks), ...note.departments, ...note.tags]
        .join('\n')
        .toLowerCase()
        .includes(query)
    )
  })
  return result.sort((first, second) => {
    if (filters.sort === 'scene') {
      const firstIndex = indices.get(first.ranges[0]?.blockId) ?? Number.MAX_SAFE_INTEGER
      const secondIndex = indices.get(second.ranges[0]?.blockId) ?? Number.MAX_SAFE_INTEGER
      if (firstIndex !== secondIndex) return firstIndex - secondIndex
      const offset = (first.ranges[0]?.from ?? 0) - (second.ranges[0]?.from ?? 0)
      if (offset) return offset
    }
    return second.updatedAt.localeCompare(first.updatedAt)
  })
}
