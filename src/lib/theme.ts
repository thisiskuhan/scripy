export const THEME_KEY = 'scripy.appearance'
export const THEME_OPTIONS = ['light', 'dark', 'system'] as const
export type ThemePreference = (typeof THEME_OPTIONS)[number]
export type ResolvedTheme = 'light' | 'dark'
export const THEME_BACKGROUNDS: Record<ResolvedTheme, string> = { light: '#f0f2f3', dark: '#181c1a' }

export function parseTheme(value: string | null): ThemePreference {
  return THEME_OPTIONS.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

export function readThemePreference(): ThemePreference {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.documentElement.style.backgroundColor = THEME_BACKGROUNDS[theme]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BACKGROUNDS[theme])
  return theme
}
