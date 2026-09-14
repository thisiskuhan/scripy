import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { clampPanelWidth, type PanelBounds } from '../lib/panels'

export function SidebarResizeHandle({
  side,
  bounds,
  defaultWidth,
  controls,
  onResize,
}: {
  side: 'navigation' | 'notes'
  bounds: PanelBounds
  defaultWidth: number
  controls: string
  onResize(width: number): void
}) {
  const drag = useRef<{ pointer: number; start: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const direction = side === 'navigation' ? 1 : -1
  const resize = (width: number) => onResize(clampPanelWidth(width, bounds.min, bounds.max))
  return (
    <div
      role="separator"
      aria-label={side === 'navigation' ? 'Resize navigation' : 'Resize notes'}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={bounds.width}
      aria-valuetext={`${bounds.width} pixels`}
      title={side === 'navigation' ? 'Resize navigation' : 'Resize notes'}
      tabIndex={0}
      className={`sidebar-resizer resizer-${side}${dragging ? ' is-resizing' : ''}`}
      onDoubleClick={() => resize(defaultWidth)}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, start: event.clientX, width: bounds.width }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer !== event.pointerId) return
        if (event.buttons === 0) {
          drag.current = null
          setDragging(false)
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
          return
        }
        resize(drag.current.width + direction * (event.clientX - drag.current.start))
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return
        drag.current = null
        setDragging(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        if (drag.current) resize(drag.current.width)
        drag.current = null
        setDragging(false)
      }}
      onLostPointerCapture={() => {
        drag.current = null
        setDragging(false)
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 50 : 10
        if (event.key === 'ArrowLeft') resize(bounds.width - direction * step)
        else if (event.key === 'ArrowRight') resize(bounds.width + direction * step)
        else if (event.key === 'Home') resize(bounds.min)
        else if (event.key === 'End') resize(bounds.max)
        else return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <GripVertical size={12} />
    </div>
  )
}
