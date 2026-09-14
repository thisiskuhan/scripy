import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string
  children: ReactNode
  onClose(): void
  wide?: boolean
  className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`dialog ${wide ? 'dialog-wide' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" title="Close dialog" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
