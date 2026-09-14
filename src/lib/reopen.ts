import { serializeProject, type Screenplay } from './screenplay'

export function chooseReopenedDraft(recovery: Screenplay, disk: Screenplay, changedOnDisk: boolean) {
  const different = serializeProject(recovery) !== serializeProject(disk)
  const recover =
    different &&
    !changedOnDisk &&
    recovery.id === disk.id &&
    Date.parse(recovery.updatedAt) > Date.parse(disk.updatedAt)
  return { project: recover ? recovery : disk, recovered: recover, preserveRecovery: different && !recover }
}
