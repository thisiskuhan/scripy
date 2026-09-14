import { useEffect, useLayoutEffect, useState } from 'react'
import {
  applyTheme,
  parseTheme,
  readThemePreference,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from './theme'

export function useTheme() {
  const [error, setError] = useState('')
  const [preference, setPreference] = useState(readThemePreference)
  const [theme, setTheme] = useState(() =>
    resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches),
  )

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setTheme(applyTheme(preference))
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [preference])

  useEffect(() => {
    const receivePreference = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === THEME_KEY || event.key === null)) {
        const next = parseTheme(event.newValue)
        setTheme(applyTheme(next))
        setPreference(next)
      }
    }
    window.addEventListener('storage', receivePreference)
    return () => window.removeEventListener('storage', receivePreference)
  }, [])

  useEffect(() => {
    let active = true
    void window.scripyDesktop
      ?.setAppearance(preference)
      .then(() => {
        if (active) setError('')
      })
      .catch(() => {
        if (active) setError('The desktop appearance could not be saved. Your screenplay is unaffected.')
      })
    return () => {
      active = false
    }
  }, [preference])

  function chooseTheme(next: ThemePreference): boolean {
    setTheme(applyTheme(next))
    setPreference(next)
    try {
      localStorage.setItem(THEME_KEY, next)
      return true
    } catch {
      return false
    }
  }

  return { preference, theme, chooseTheme, error }
}

export type Appearance = ReturnType<typeof useTheme>
