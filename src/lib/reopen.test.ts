import { describe, expect, it } from 'vitest'
import { createScreenplay, makeBlock } from './screenplay'
import { chooseReopenedDraft } from './reopen'

describe('disk and crash recovery reconciliation', () => {
  it('uses a newer recovery draft only when the underlying file did not change', () => {
    const disk = { ...createScreenplay(), updatedAt: '2026-09-13T10:00:00Z' }
    const recovery = {
      ...disk,
      blocks: [makeBlock('action', 'The final unsaved line.')],
      updatedAt: '2026-09-13T10:01:00Z',
    }
    expect(chooseReopenedDraft(recovery, disk, false)).toEqual({
      project: recovery,
      recovered: true,
      preserveRecovery: false,
    })
  })

  it('loads external file edits even if the embedded document timestamp is older', () => {
    const disk = { ...createScreenplay('Changed externally'), updatedAt: '2026-09-13T09:00:00Z' }
    const recovery = { ...disk, title: 'Stale local draft', updatedAt: '2026-09-13T10:00:00Z' }
    expect(chooseReopenedDraft(recovery, disk, true)).toEqual({
      project: disk,
      recovered: false,
      preserveRecovery: true,
    })
  })

  it('does not apply recovery from a different screenplay to a replaced file', () => {
    const disk = createScreenplay('Replacement document')
    const recovery = { ...createScreenplay('Previous document'), updatedAt: '2099-01-01T00:00:00Z' }
    expect(chooseReopenedDraft(recovery, disk, false).project).toBe(disk)
  })
})
