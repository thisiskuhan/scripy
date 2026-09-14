import { useEffect, useRef, useState } from 'react'

export function useFullscreen() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const changing = useRef(false)
  const mounted = useRef(true)
  const supported = Boolean(window.scripyDesktop || document.fullscreenEnabled)

  useEffect(() => {
    mounted.current = true
    const desktop = window.scripyDesktop
    const update = (fullscreen: boolean) => {
      if (mounted.current) setActive(fullscreen)
    }
    const browserChange = () => update(Boolean(document.fullscreenElement))
    const unsubscribe = desktop?.onFullscreenChange(update)
    if (desktop)
      void desktop
        .getFullscreen()
        .then(update)
        .catch(() => {
          if (mounted.current)
            setError('The window state could not be read. Try the fullscreen button again.')
        })
    document.addEventListener('fullscreenchange', browserChange)
    return () => {
      mounted.current = false
      unsubscribe?.()
      document.removeEventListener('fullscreenchange', browserChange)
    }
  }, [])

  async function setFullscreen(next: boolean) {
    if (changing.current) return
    if (!supported) {
      setError('Fullscreen is not available in this browser.')
      return
    }
    changing.current = true
    setPending(true)
    setError('')
    try {
      if (window.scripyDesktop) {
        const fullscreen = await window.scripyDesktop.setFullscreen(next)
        if (mounted.current) setActive(fullscreen)
      } else {
        if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen()
        else if (!next && document.fullscreenElement) await document.exitFullscreen()
        if (mounted.current) setActive(Boolean(document.fullscreenElement))
      }
    } catch {
      if (mounted.current)
        setError('Fullscreen could not be changed. Your draft is unchanged; try the fullscreen button again.')
    } finally {
      changing.current = false
      if (mounted.current) setPending(false)
    }
  }

  const command = useRef(setFullscreen)
  command.current = setFullscreen
  const state = useRef(active)
  state.current = active
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || document.querySelector('dialog[open]')) return
      if (event.key === 'F11') {
        event.preventDefault()
        void command.current(!state.current)
      } else if (event.key === 'Escape' && state.current) {
        event.preventDefault()
        void command.current(false)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  return {
    active,
    pending,
    supported,
    error,
    clearError: () => setError(''),
    toggle: () => setFullscreen(!active),
  }
}
