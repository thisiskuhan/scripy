import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from 'motion/react'
import type { PointerEvent, ReactNode } from 'react'

export function HeroHighlight({ children }: { children: ReactNode }) {
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const pointerOpacity = useMotionValue(0)
  const reduceMotion = useReducedMotion()
  const mask = useMotionTemplate`radial-gradient(240px circle at ${pointerX}px ${pointerY}px, black 0%, transparent 100%)`

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || !event.isPrimary) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(event.clientX - bounds.left)
    pointerY.set(event.clientY - bounds.top)
    pointerOpacity.set(1)
  }

  return (
    <div
      className="hero-highlight"
      onPointerMove={movePointer}
      onPointerDown={movePointer}
      onPointerUp={(event) => {
        if (event.pointerType !== 'mouse') pointerOpacity.set(0)
      }}
      onPointerLeave={() => pointerOpacity.set(0)}
      onPointerCancel={() => pointerOpacity.set(0)}
    >
      <div className="hero-dots" aria-hidden="true" />
      {!reduceMotion && (
        <motion.div
          className="hero-dots hero-dots-active"
          aria-hidden="true"
          style={{ maskImage: mask, WebkitMaskImage: mask, opacity: pointerOpacity }}
        />
      )}
      <div className="hero-highlight-content">{children}</div>
    </div>
  )
}

export function Highlight({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.span
      className="quote-highlight"
      initial={reduceMotion ? false : { backgroundSize: '0% 100%' }}
      animate={{ backgroundSize: '100% 100%' }}
      transition={{ duration: reduceMotion ? 0 : 1.1, delay: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  )
}
