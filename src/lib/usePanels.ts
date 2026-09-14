import { useEffect, useState } from 'react'
import { DEFAULT_PANEL_LAYOUT, PANEL_LAYOUT_KEY, readPanelLayout } from './panels'

export function usePanels() {
  const [layout, setLayout] = useState(() => {
    try {
      return readPanelLayout(JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) || '{}'))
    } catch {
      return DEFAULT_PANEL_LAYOUT
    }
  })
  const [viewport, setViewport] = useState(window.innerWidth)
  useEffect(() => {
    const update = () => setViewport(window.innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      return
    }
  }, [layout])
  return { layout, setLayout, viewport }
}
