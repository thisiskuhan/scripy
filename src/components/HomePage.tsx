import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  Film,
  FolderOpen,
  LoaderCircle,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { version } from '../../package.json'
import { DESKTOP_APP_URL, DESKTOP_DOWNLOADS } from '../lib/deployment'
import { quoteForPageLoad } from '../lib/movie-quotes'
import type { Appearance } from '../lib/useTheme'
import type { Screenplay } from '../lib/screenplay'
import { Dialog } from './Dialog'
import { FloatingNotifications, type Notice } from './FloatingNotifications'
import { HeroHighlight, Highlight } from './HeroHighlight'

interface HomePageProps {
  appearance: Appearance
  activeId?: string
  projects: Screenplay[]
  busy: boolean
  loading: boolean
  writable: boolean
  error: string
  notices: Notice[]
  modalOpen: boolean
  onNew(): void
  onOpen(): void
  onSelect(project: Screenplay): void
  onRetry(): void
}

export function HomePage(props: HomePageProps) {
  return <HomePageLayout appearance={props.appearance} error={props.error} home={props} />
}

export function HomePageLayout({
  appearance,
  onSignIn,
  busy = false,
  loading = false,
  error = '',
  home,
}: {
  appearance: Appearance
  onSignIn?(): void
  busy?: boolean
  loading?: boolean
  error?: string
  home?: HomePageProps
}) {
  const [quote] = useState(quoteForPageLoad)
  const [filter, setFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [downloadOpen, setDownloadOpen] = useState(false)
  const isHome = Boolean(home)
  const isDesktop = typeof window !== 'undefined' && Boolean(window.scripyDesktop)
  const [showTip, setShowTip] = useState(() => {
    try {
      return localStorage.getItem('scripy.home-tip-hidden') !== 'true'
    } catch {
      return true
    }
  })
  function dismissTip(forever: boolean) {
    setShowTip(false)
    if (!forever) return
    try {
      localStorage.setItem('scripy.home-tip-hidden', 'true')
    } catch {
      /* preference is best-effort */
    }
  }
  const themeAction = useRef(() => {})
  themeAction.current = () => {
    if (!appearance.chooseTheme(appearance.theme === 'dark' ? 'light' : 'dark'))
      setNotice('Appearance changed, but the preference could not be saved.')
  }
  useEffect(() => {
    document.title = isHome ? 'Home - Scripy' : 'Sign in - Scripy'
    const keydown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.repeat &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.code === 'KeyT' &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault()
        themeAction.current()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [isHome])
  const themeLabel = appearance.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const ThemeIcon = appearance.theme === 'dark' ? Sun : Moon
  const savingNotice: Notice = {
    id: 'saving-note',
    message: isDesktop
      ? 'Autosave keeps a local recovery copy. Choose Save as once to create a .scripy file; later edits update it. Ctrl/Cmd+S saves now.'
      : 'Autosaved in this browser, on this device only. Clearing site data removes drafts. Export a .scripy backup. Ctrl/Cmd+S saves now.',
    tone: 'info',
    dismissLabel: 'Dismiss note',
    dismiss: () => dismissTip(false),
    action: { label: "Don't show this again", run: () => dismissTip(true) },
  }
  const feedback = (
    <div className="login-feedback">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  )

  return (
    <HeroHighlight>
      <div className={`login-page ${isHome ? 'home-page' : ''}`}>
        <header className="login-header">
          <span className="login-studio">Scripy.</span>
          <button
            className="icon-button"
            aria-label={themeLabel}
            title={`${themeLabel} (Alt+T)`}
            aria-keyshortcuts="Alt+T"
            onClick={() => themeAction.current()}
          >
            <ThemeIcon size={19} />
          </button>
        </header>
        <main className="login-main" aria-label={isHome ? 'Scripy home' : 'Sign in to Scripy'}>
          <div className="login-content">
            <h1 className="login-title">{isHome ? 'Welcome to Scripy' : 'Sign in to Scripy'}</h1>
            <div className={isHome ? 'home-intro' : undefined}>
              <figure className="login-quote">
                <blockquote>
                  <span className="quote-opening" aria-hidden="true">
                    &ldquo;
                  </span>
                  {quote.text}
                  <Highlight>{quote.highlight}</Highlight>
                  <span aria-hidden="true">&rdquo;</span>
                </blockquote>
                <figcaption>
                  <Film size={14} aria-hidden="true" />
                  <cite>{quote.film}</cite>
                  <span>({quote.year})</span>
                </figcaption>
              </figure>
              {isHome && !isDesktop && (
                <div className="home-download">
                  <button
                    type="button"
                    className="home-download-button"
                    onClick={() => setDownloadOpen(true)}
                  >
                    <Download size={16} aria-hidden="true" />
                    Download desktop app
                  </button>
                  <span className="home-download-platforms">Windows / macOS / Linux</span>
                </div>
              )}
            </div>
            {home ? (
              <div className="home-library">
                <h2 className="home-library-title">Your screenplays</h2>
                <div className="home-actions">
                  <button
                    className="button primary"
                    onClick={home.onNew}
                    disabled={home.busy || !home.writable}
                  >
                    <FilePlus2 size={18} />
                    New screenplay
                  </button>
                  <button className="button" onClick={home.onOpen} disabled={home.busy || !home.writable}>
                    <FolderOpen size={18} />
                    Open file
                  </button>
                </div>
                <section className="home-recent" aria-labelledby="recent-screenplays-heading">
                  <div className="home-recent-heading">
                    <h2 id="recent-screenplays-heading">Recent screenplays</h2>
                    {home.projects.length > 0 && (
                      <label className="home-filter">
                        <Search size={15} aria-hidden="true" />
                        <input
                          type="search"
                          aria-label="Search recent screenplays"
                          placeholder="Search"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                        />
                      </label>
                    )}
                  </div>
                  {home.loading ? (
                    <div className="loading-inline" role="status" aria-label="Loading recent screenplays">
                      <LoaderCircle className="spin" size={20} />
                    </div>
                  ) : (
                    <div className="home-recent-list">
                      {home.projects
                        .filter((item) =>
                          `${item.title} ${item.author} ${item.draft}`
                            .toLowerCase()
                            .includes(filter.trim().toLowerCase()),
                        )
                        .map((item) => (
                          <button
                            key={item.id}
                            className="home-recent-item"
                            data-current={item.id === home.activeId ? 'true' : undefined}
                            aria-label={`Open ${item.title}`}
                            disabled={home.busy || (!home.writable && item.id !== home.activeId)}
                            onClick={() => home.onSelect(item)}
                          >
                            <FileText size={21} aria-hidden="true" />
                            <span className="home-recent-title">
                              <strong>{item.title}</strong>
                              <small>{[item.author, item.draft].filter(Boolean).join(' / ')}</small>
                            </span>
                            <time dateTime={item.updatedAt}>
                              {new Intl.DateTimeFormat(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }).format(new Date(item.updatedAt))}
                            </time>
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        ))}
                      {!home.error && !home.projects.length && (
                        <p className="home-empty">No screenplays yet.</p>
                      )}
                      {home.projects.length > 0 &&
                        !home.projects.some((item) =>
                          `${item.title} ${item.author} ${item.draft}`
                            .toLowerCase()
                            .includes(filter.trim().toLowerCase()),
                        ) && <p className="home-empty">No matching screenplays.</p>}
                    </div>
                  )}
                  {home.error && (
                    <button className="button small" onClick={home.onRetry} disabled={home.loading}>
                      <RefreshCw size={14} />
                      Retry loading screenplays
                    </button>
                  )}
                </section>
                {feedback}
              </div>
            ) : (
              <div className="login-actions">
                <button
                  className="google-sign-in"
                  onClick={onSignIn}
                  disabled={busy || loading}
                  aria-busy={busy}
                >
                  {busy || loading ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : (
                    <img src={`${import.meta.env.BASE_URL}google-g.svg`} alt="" width="20" height="20" />
                  )}
                  <span>
                    {busy ? 'Connecting...' : loading ? 'Loading Google...' : 'Continue with Google'}
                  </span>
                </button>
                <p className="login-consent">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>Access only to the Google Drive files you use with Scripy.</span>
                </p>
                <div className="login-divider">
                  <span>or</span>
                </div>
                {DESKTOP_APP_URL ? (
                  <a
                    className="login-download"
                    href={DESKTOP_APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={17} />
                    Download local app
                  </a>
                ) : (
                  <button
                    className="login-download"
                    onClick={() => setNotice('The desktop build link is coming soon.')}
                  >
                    <Download size={17} />
                    Download local app
                  </button>
                )}
                <p className="login-platforms">Windows / macOS / Linux</p>
              </div>
            )}
            {!home && feedback}
          </div>
        </main>
        {home && (
          <FloatingNotifications
            notices={
              showTip &&
              !home.loading &&
              !home.busy &&
              !home.modalOpen &&
              !downloadOpen &&
              !home.error &&
              !notice &&
              !home.notices.length
                ? [savingNotice]
                : home.notices
            }
          />
        )}
        {downloadOpen && (
          <Dialog
            title="Download the desktop app"
            onClose={() => setDownloadOpen(false)}
            className="download-dialog"
          >
            <p className="download-dialog-intro">Choose the installer for your operating system.</p>
            <div className="download-options">
              {[
                { key: 'win', os: 'Windows', format: 'Installer (.exe)', url: DESKTOP_DOWNLOADS.windows },
                { key: 'mac', os: 'macOS', format: 'Disk image (.dmg)', url: DESKTOP_DOWNLOADS.mac },
                {
                  key: 'linux-appimage',
                  os: 'Linux',
                  format: 'AppImage',
                  url: DESKTOP_DOWNLOADS.linuxAppImage,
                },
                {
                  key: 'linux-deb',
                  os: 'Linux',
                  format: 'Debian package (.deb)',
                  url: DESKTOP_DOWNLOADS.linuxDeb,
                },
              ].map((item) =>
                item.url ? (
                  <a
                    key={item.key}
                    className="download-option"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={18} aria-hidden="true" />
                    <span className="download-option-label">
                      <strong>{item.os}</strong>
                      <small>{item.format}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <span key={item.key} className="download-option is-soon" aria-disabled="true">
                    <Download size={18} aria-hidden="true" />
                    <span className="download-option-label">
                      <strong>{item.os}</strong>
                      <small>{item.format}</small>
                    </span>
                    <em>Coming soon</em>
                  </span>
                ),
              )}
            </div>
          </Dialog>
        )}
        <footer className="login-footer">
          <span>FADE IN.</span>
          {isHome ? (
            <span>LOCAL WORKSPACE</span>
          ) : (
            <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
          )}
          <span>Scripy {version}</span>
        </footer>
      </div>
    </HeroHighlight>
  )
}
