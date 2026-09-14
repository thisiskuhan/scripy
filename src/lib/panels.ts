export const PANEL_LAYOUT_KEY = 'scripy.panel-layout'
export const MIN_EDITOR_WIDTH = 480
export const DEFAULT_PANEL_LAYOUT = { navigationWidth: 238, notesWidth: 320, navigationCollapsed: false }
export type PanelLayout = typeof DEFAULT_PANEL_LAYOUT
export interface PanelBounds {
  width: number
  min: number
  max: number
}

export function clampPanelWidth(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)))
}

export function readPanelLayout(value: unknown): PanelLayout {
  const stored = value && typeof value === 'object' ? (value as Partial<PanelLayout>) : {}
  return {
    navigationWidth:
      typeof stored.navigationWidth === 'number' && Number.isFinite(stored.navigationWidth)
        ? clampPanelWidth(stored.navigationWidth, 200, 420)
        : DEFAULT_PANEL_LAYOUT.navigationWidth,
    notesWidth:
      typeof stored.notesWidth === 'number' && Number.isFinite(stored.notesWidth)
        ? clampPanelWidth(stored.notesWidth, 240, 560)
        : DEFAULT_PANEL_LAYOUT.notesWidth,
    navigationCollapsed: stored.navigationCollapsed === true,
  }
}

export function panelBounds(
  viewport: number,
  layout: PanelLayout,
  navigationOpen: boolean,
  notesOpen: boolean,
): { navigation: PanelBounds; notes: PanelBounds } {
  const navigationDocked = viewport > 800
  const notesDocked = viewport > 1100
  const navigationLimit = Math.max(
    200,
    Math.min(
      420,
      navigationDocked ? viewport - MIN_EDITOR_WIDTH - (notesDocked && notesOpen ? 240 : 0) : viewport - 40,
    ),
  )
  const navigationWidth = clampPanelWidth(layout.navigationWidth, 200, navigationLimit)
  const notesLimit = Math.max(
    240,
    Math.min(
      560,
      notesDocked ? viewport - MIN_EDITOR_WIDTH - (navigationOpen ? navigationWidth : 0) : viewport - 40,
    ),
  )
  const notesWidth = clampPanelWidth(layout.notesWidth, 240, notesLimit)
  return {
    navigation: {
      width: navigationWidth,
      min: 200,
      max: Math.max(
        200,
        Math.min(
          navigationLimit,
          notesDocked && notesOpen ? viewport - MIN_EDITOR_WIDTH - notesWidth : navigationLimit,
        ),
      ),
    },
    notes: { width: notesWidth, min: 240, max: notesLimit },
  }
}
