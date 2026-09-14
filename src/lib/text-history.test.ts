import { describe, expect, it } from 'vitest'
import { TextHistory } from './text-history'

describe('independent note history', () => {
  it('undoes and redoes text with caret restoration', () => {
    const history = new TextHistory('Original')
    history.select(8, 8)
    history.change('Original note', 13, 13)
    expect(history.canUndo).toBe(true)
    expect(history.step('undo', () => true)).toBe(true)
    expect(history.value).toBe('Original')
    expect(history.selection).toEqual({ from: 8, to: 8 })
    expect(history.step('redo', () => true)).toBe(true)
    expect(history.value).toBe('Original note')
  })
  it.each([
    ['aaa', 'aaaa'],
    ['A note\nSecond line', 'A revised note\nSecond line'],
    ['cafe', 'caf\u00e9'],
    ['Before \ud83c\udfac after', 'Before  after'],
  ])('round-trips edits from %s to %s', (before, after) => {
    const history = new TextHistory(before)
    history.change(after, after.length, after.length)
    expect(history.value).toBe(after)
    history.step('undo', () => true)
    expect(history.value).toBe(before)
    history.step('redo', () => true)
    expect(history.value).toBe(after)
  })
  it('does not advance history when the document rejects an undo', () => {
    const history = new TextHistory('Original')
    history.change('Changed', 7, 7)
    expect(history.step('undo', () => false)).toBe(false)
    expect(history.value).toBe('Changed')
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)
  })
})
