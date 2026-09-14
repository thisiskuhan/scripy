import { useEffect, useState } from 'react'
import { ChevronRight, CloudDownload, FileText, LoaderCircle, RefreshCw } from 'lucide-react'
import type { GoogleDrive, DriveCopy } from '../lib/google-drive'
import type { Screenplay } from '../lib/screenplay'
import { Dialog } from './Dialog'

export function DriveFilesDialog({
  drive,
  onOpen,
  onClose,
}: {
  drive: GoogleDrive
  onOpen(project: Screenplay, name: string): Promise<void>
  onClose(): void
}) {
  const [files, setFiles] = useState<DriveCopy[]>([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState('')
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string>()
  const [nextCursor, setNextCursor] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void drive
      .listCopies(cursor)
      .then((result) => {
        if (!active) return
        setFiles((previous) =>
          cursor
            ? [...previous, ...result.files.filter((file) => !previous.some((item) => item.id === file.id))]
            : result.files,
        )
        setNextCursor(result.nextPageToken)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Google Drive could not be opened.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [drive, cursor, attempt])

  return (
    <Dialog
      title="Google Drive"
      wide
      onClose={() => {
        if (!opening) onClose()
      }}
    >
      <div className="projects-heading">
        <span>
          <CloudDownload size={15} />
          Scripy files
        </span>
      </div>
      {error && (
        <div className="drive-error" role="alert">
          <p>{error}</p>
          <button
            className="button small"
            onClick={() => setAttempt((value) => value + 1)}
            disabled={loading || Boolean(opening)}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
      <div className="project-list">
        {files.map((file) => (
          <button
            className="project-list-item"
            key={file.id}
            disabled={loading || Boolean(opening)}
            onClick={async () => {
              setOpening(file.id)
              setError('')
              try {
                await onOpen(await drive.openCopy(file), file.name)
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'This Drive file could not be opened.')
              } finally {
                setOpening('')
              }
            }}
          >
            <span className="project-list-icon">
              <FileText size={22} />
            </span>
            <span>
              <strong>{file.name}</strong>
              <small>{new Date(file.modifiedTime).toLocaleString()}</small>
            </span>
            {opening === file.id ? <LoaderCircle className="spin" size={16} /> : <ChevronRight size={16} />}
          </button>
        ))}
      </div>
      {loading && (
        <div className="loading-inline" role="status" aria-label="Loading Google Drive">
          <LoaderCircle className="spin" size={18} />
        </div>
      )}
      {!loading && !error && !files.length && (
        <p className="empty-label">No Scripy files in Google Drive yet.</p>
      )}
      {nextCursor && (
        <button
          className="button small"
          disabled={loading || Boolean(opening)}
          onClick={() => setCursor(nextCursor)}
        >
          Load more
        </button>
      )}
    </Dialog>
  )
}
