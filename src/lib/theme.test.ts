import { describe, expect, it } from 'vitest'
import { parseTheme, resolveTheme } from './theme'

describe('appearance preference', () => {
  it('defaults missing or invalid preferences to the system setting', () => {
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('unknown')).toBe('system')
    expect(parseTheme('DARK')).toBe('system')
    for (const theme of ['light', 'dark', 'system'] as const) expect(parseTheme(theme)).toBe(theme)
  })

  it('follows the OS only when System is selected', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})
