import { describe, expect, it } from 'vitest'
import { DEFAULT_PANEL_LAYOUT, MIN_EDITOR_WIDTH, panelBounds, readPanelLayout } from './panels'

describe('sidebar layout limits', () => {
  it('ignores malformed preferences and clamps saved widths', () => {
    expect(readPanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT)
    expect(readPanelLayout({ navigationWidth: NaN, notesWidth: 'wide', navigationCollapsed: 'yes' })).toEqual(
      DEFAULT_PANEL_LAYOUT,
    )
    expect(readPanelLayout({ navigationWidth: -500, notesWidth: 4000, navigationCollapsed: true })).toEqual({
      navigationWidth: 200,
      notesWidth: 560,
      navigationCollapsed: true,
    })
  })
  it.each([801, 1024, 1101, 1180, 1366, 1920])('preserves writing space at %i pixels', (width) => {
    const bounds = panelBounds(
      width,
      { navigationWidth: 420, notesWidth: 560, navigationCollapsed: false },
      true,
      true,
    )
    expect(width - bounds.navigation.width - (width > 1100 ? bounds.notes.width : 0)).toBeGreaterThanOrEqual(
      MIN_EDITOR_WIDTH,
    )
    expect(bounds.navigation.width).toBeLessThanOrEqual(bounds.navigation.max)
  })
  it('keeps touch drawers within narrow screens', () => {
    const bounds = panelBounds(320, DEFAULT_PANEL_LAYOUT, true, true)
    expect(bounds.navigation.max).toBe(280)
    expect(bounds.notes.width).toBe(280)
  })
  it('releases space when the opposite panel is collapsed', () => {
    const open = panelBounds(1180, DEFAULT_PANEL_LAYOUT, true, true)
    const closed = panelBounds(1180, DEFAULT_PANEL_LAYOUT, false, true)
    expect(closed.notes.max).toBeGreaterThan(open.notes.max)
  })
})
