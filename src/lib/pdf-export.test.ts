import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScreenplay } from './screenplay'
import { exportPdf } from './pdf-export'

afterEach(() => vi.unstubAllGlobals())

describe('obsolete preview address protection', () => {
  it.each(['5173', '5187'])(
    'protects an open draft on old port %s with actionable recovery instructions',
    async (port) => {
      vi.stubGlobal('location', { port })
      const worker = vi.fn()
      vi.stubGlobal('Worker', worker)
      await expect(exportPdf(createScreenplay(), true, false)).rejects.toThrow('http://127.0.0.1:7457/')
      expect(worker).not.toHaveBeenCalled()
    },
  )
})
