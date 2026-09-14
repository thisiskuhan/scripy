import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

export interface Notice {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
  dismiss(): void
  dismissLabel?: string
  action?: { label: string; run(): void }
}

export function FloatingNotifications({ notices }: { notices: Notice[] }) {
  const [target, setTarget] = useState<Element>(document.body)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () => setTarget(document.querySelector('dialog[open]') ?? document.body)
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const element = container.current
    if (!element?.isConnected || !notices.length) return
    element.setAttribute('popover', 'manual')
    element.showPopover?.()
    return () => {
      if (element.isConnected && element.matches(':popover-open')) element.hidePopover()
    }
  }, [target, notices.length])
  if (!notices.length) return null
  return createPortal(
    <div ref={container} className="floating-notifications" aria-label="Notifications">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`floating-notice notice-${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
        >
          {notice.tone === 'success' ? <CircleCheck size={19} /> : <CircleAlert size={19} />}
          <div className="notice-content">
            <span>{notice.message}</span>
            {notice.action && (
              <button className="notice-action" onClick={notice.action.run}>
                {notice.action.label}
              </button>
            )}
          </div>
          <button
            className="icon-button"
            aria-label={notice.dismissLabel ?? 'Dismiss notification'}
            title="Dismiss notification"
            onClick={notice.dismiss}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>,
    target,
  )
}
