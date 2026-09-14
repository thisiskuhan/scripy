import { useId, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { ARTWORK_UPLOAD_REQUIREMENTS, prepareTitleArtwork, type TitleArtwork } from '../lib/artwork'
import { paperMetrics, type PaperSize } from '../lib/paper'
import { FloatingNotifications } from './FloatingNotifications'

interface Props {
  artwork: TitleArtwork | null
  title: string
  author: string
  paperSize: PaperSize
  disabled: boolean
  onChange(artwork: TitleArtwork | null): void
  onBusyChange(busy: boolean): void
}

export function TitleArtworkEditor({
  artwork,
  title,
  author,
  paperSize,
  disabled,
  onChange,
  onBusyChange,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const requirementsId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const paper = paperMetrics(paperSize)
  return (
    <section className="title-artwork-section" aria-label="Title page">
      <div className="title-artwork-heading">
        <span className="field-heading">
          Title page <span className="optional-label">Optional image</span>
        </span>
        <div className="artwork-actions">
          <button
            type="button"
            className="button small"
            aria-describedby={requirementsId}
            disabled={disabled || loading}
            onClick={() => input.current?.click()}
          >
            {loading ? <LoaderCircle size={14} className="spin" /> : <ImagePlus size={14} />}
            {artwork ? 'Replace image' : 'Add image'}
          </button>
          {artwork && (
            <button
              type="button"
              className="icon-button"
              aria-label="Remove title image"
              title="Remove title image"
              disabled={disabled || loading}
              onClick={() => {
                setError('')
                onChange(null)
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        aria-label="Title-page image file"
        aria-describedby={requirementsId}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file || loading) return
          setLoading(true)
          onBusyChange(true)
          setError('')
          try {
            onChange(await prepareTitleArtwork(file))
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'This image could not be loaded.')
          } finally {
            setLoading(false)
            onBusyChange(false)
          }
        }}
      />
      <p className="artwork-requirements" id={requirementsId}>
        {ARTWORK_UPLOAD_REQUIREMENTS}
      </p>
      <div
        className="title-preview"
        data-paper-size={paperSize}
        aria-label="Title-page preview"
        style={{ aspectRatio: `${paper.width} / ${paper.height}` }}
      >
        {artwork && <img className="title-preview-image" src={artwork.dataUrl} alt="Title-page artwork" />}
        <div className={`title-preview-copy ${artwork ? 'with-artwork' : ''}`}>
          <strong>{title.trim() || 'Untitled screenplay'}</strong>
          {author.trim() && (
            <>
              <span>Written by</span>
              <span>{author.trim()}</span>
            </>
          )}
        </div>
      </div>
      {artwork && (
        <div className="artwork-filename" title={artwork.name}>
          {artwork.name}
        </div>
      )}
      {loading && (
        <span role="status" className="artwork-progress">
          Processing image...
        </span>
      )}
      <FloatingNotifications
        notices={
          error ? [{ id: 'artwork-error', message: error, tone: 'error', dismiss: () => setError('') }] : []
        }
      />
    </section>
  )
}
