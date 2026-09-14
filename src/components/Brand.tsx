import { useId } from 'react'

export function Brand({ className = '' }: { className?: string }) {
  const tooltipId = useId()
  return (
    <span className={`wordmark ${className}`} tabIndex={0} aria-describedby={tooltipId}>
      scripy<span className="brand-period">.</span>
      <span className="brand-tooltip" id={tooltipId} role="tooltip">
        made by Kuhan
      </span>
    </span>
  )
}
