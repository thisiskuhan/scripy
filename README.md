# Scripy

A local-first screenplay writing studio built with React, TypeScript, ProseMirror, and Electron. The first screen is the script, with an editable original sample, **The Quiet Hours**.

## Run

Use Node.js 22.14 or newer. Install dependencies once with `npm ci`.

```sh
npm run dev           # http://127.0.0.1:7457/
npm run preview       # Production browser preview on the same port after npm run build
npm run desktop       # Build and launch the standalone desktop app
npm run desktop:dev   # Desktop development with live updates on port 7457
npm run desktop:pack  # Produce release/0.5.0/linux-unpacked/ on Linux
npm run desktop:dist:linux  # Build shareable AppImage and tar.gz artifacts
npm run desktop:install  # Register the app and .scripy file type for your Linux account
npm run desktop:check-association
```

All normal browser development, preview, and desktop-development commands use port **7457** and fail if it is occupied; they do not silently select a different port. Run only one of these servers at a time. Automated browser tests use a separate isolated test port. Use the exact loopback URL above to avoid unrelated apps listening on another localhost address. Browser storage is scoped to the address and port: save a `.scripy` copy in an older tab before moving from a previous URL.

The packaged desktop application works offline, loads bundled files directly, and needs **no HTTP port, dev server, Node.js installation, or source checkout** on the receiving device. It ignores `SCRIPY_DEV_URL` when packaged. Browser and desktop storage are separate. Transfer drafts using a `.scripy` file; application archives do not contain your personal drafts or recovery profile.

The Linux executable is `release/0.5.0/linux-unpacked/scripy`. Keep its directory together and in place after registration. Double-click a `.scripy` file, use Open, or launch `./release/0.5.0/linux-unpacked/scripy "/path/to/My screenplay.scripy"`. Files open in the existing window when Scripy is already running. Close an older Scripy version before using the new build; versioned output does not overwrite a running previous release.

## Sharing a Desktop Build

For Linux x64, send either `release/0.5.0/Scripy-0.5.0-linux-x86_64.AppImage` or `release/0.5.0/Scripy-0.5.0-linux-x64.tar.gz`.

- AppImage: mark it executable if file transfer removed that permission, then run it. Some Linux systems require FUSE support; the complete tar archive is an alternative when FUSE is unavailable.
- Portable archive: extract the entire archive and run `scripy` inside it. Do not send or move only the executable; its libraries and `resources` directory must stay together.
- These artifacts target Linux x64 and still require a compatible graphical Linux environment and Electron's system libraries. They are not Windows/macOS installers and are not suitable for ARM devices without a matching build.
- Windows: use `npm run desktop:dist:win` on a Windows build/test machine to produce NSIS installation output. macOS: use `npm run desktop:dist:mac` on macOS to produce DMG/ZIP output. Verify the architecture, signing/notarization, installation, and runtime on each target platform before distribution. Those platforms have not been runtime-tested in this Linux workspace.

`npm run test:portable` extracts the built Linux archive into a new path containing spaces, launches from an unrelated working directory with a fresh profile and networking disabled, and verifies fullscreen, theme, save/reopen, and A4/title-image PDF export. It also supplies an invalid development URL to prove packaged startup does not use it. This simulates transfer on this machine; it is not a test on every receiving device.

## Writing

- Seven screenplay elements: scene heading, action, character, dialogue, parenthetical, transition, and shot.
- Contextual Enter/Tab behavior, undo/redo, automatic `INT.`/`EXT.` recognition, and character completion.
- Scene navigation, filtering, character counts, scene notes, a reorderable outline, and literal find/replace.
- Fullscreen, Focus mode, zoom, scene numbers, spellcheck, and responsive navigation drawers.
- Light, Dark, and System appearance, including low-glare screenplay pages, menus, dialogs, and outline cards.
- US Letter and A4 pages with bundled Courier Prime, heading/cue keep-together rules, and dialogue continuation markers.
- Selectable-text PDF export with embedded fonts and an optional title page. The editor and PDF share pagination rules.
- Optional PNG/JPEG title artwork, centered above the title only; preview, replace, remove, and portable embedded storage.
- Native `.scripy` import/export, Fountain text import/export, and a local project library.

| Key                 | Action                                                      |
| ------------------- | ----------------------------------------------------------- |
| Enter               | Next element; character/parenthetical leads to dialogue     |
| Tab / Shift+Tab     | Cycle elements; Tab also completes matching character names |
| Alt+1 through Alt+7 | Choose an element in the order listed above                 |
| Ctrl/Cmd+Z          | Undo                                                        |
| Ctrl/Cmd+Shift+Z    | Redo                                                        |
| Ctrl/Cmd+F          | Find and replace                                            |
| Ctrl/Cmd+S          | Save a native file, or download a copy in the browser       |
| F11                 | Toggle fullscreen when no dialog is open                    |
| Escape              | Leave focus mode, close find, or dismiss a drawer           |

The document menu contains New, Open, My screenplays, Save, Save As, Show in folder, and document details. Ctrl/Cmd+Shift+S runs Save As. The footer and window title show the actual native file path; clicking the footer path reveals the file in the file manager. A draft without a disk file is labeled as recovery-only. Browser downloads cannot expose absolute local paths.

The expand/shrink button beside the appearance and Focus controls enters or exits fullscreen. F11 toggles it; Escape exits it when no modal dialog is open. In the desktop app, Escape closes an open modal first, leaving fullscreen active until the next Escape. Focus mode is separate and can be combined with fullscreen. Native/window-manager exits update the button state. Browser fullscreen requires permission and a user gesture; it may be unavailable in restricted embeds.

Export offers PDF, Fountain, or a portable Scripy copy. The native format is UTF-8, versioned JSON with a `.scripy` extension. See [docs/file-format.md](docs/file-format.md) and [docs/scripy.schema.json](docs/scripy.schema.json).

Choose **Paper size** in Export or Screenplay details. The setting belongs to the document and changes both live pages and the PDF. In Screenplay details, use **Add image** in the title-page section, then **Save details**. PNG/JPEG uploads are processed locally and embedded; the source image file is not needed afterward. Leave **Include title page** enabled when exporting to include its artwork. Images cannot be inserted into the screenplay body.

New saves use document format version 2; existing version-1 files migrate automatically with Letter pages and no artwork. Older app builds reject the new version rather than discard paper/image settings. Keep the current desktop version installed after saving upgraded documents.

## Appearance

Use the moon/sun button beside Focus mode for a quick Light/Dark switch, or choose **Editor preferences > Appearance > Light / Dark / System**. System is the default and follows operating-system changes while the app is open. An explicit Light or Dark choice overrides the OS until changed.

Dark mode uses charcoal surfaces, subdued sage accents, and off-white script text. It covers screenplay pages, sidebars, notes, outline cards, menus, dialogs, form controls, and search highlights. The preference is stored separately from screenplay files, synchronized between browser tabs, and applied before the app loads to avoid a light startup flash. Desktop native appearance and startup background follow the saved choice as well.

Changing appearance does not modify text, page layout, selection, undo history, embedded artwork, or exported PDFs. PDFs and print styling remain light with dark text. Browser and desktop appearance preferences are separate, just like their local workspaces. If appearance storage fails, the current session still changes theme and writing continues, with a visible warning that the preference was not saved.

## Protecting Your Work

Autosave writes validated drafts to IndexedDB after a 450 ms idle period. A synchronous recovery copy protects last-moment edits on reload/close where browser storage permits it. Automatic recovery snapshots are taken at most once per minute during edits; the newest 20 are retained. Recovery history also offers manual snapshots. Restoring first checkpoints the current draft.

In Electron, saving or opening a native document associates it with its actual disk path across restarts. Startup and recent-project opening read that file from disk. Newer local recovery is used only when the saved file has not changed externally; otherwise the disk version is opened and the previous local draft is checkpointed. Missing or unreadable files leave recovery available, with a visible warning and Save As for a new location.

Autosaves use temporary-file writes, file synchronization, and atomic rename, preserving a `.bak` copy of the previous file. No-change saves do not replace that backup. SHA-256 content fingerprints detect external edits, including same-size changes, before overwriting. This is conflict detection, not a cross-application filesystem lock. Use Save As when another program changes the file. Closing waits for pending saves; a failed save offers a keep-open choice. If the app's saved-location metadata is damaged, manually opening a valid file repairs its association without deleting the recovery draft.

One tab at a time can edit a browser workspace using Web Locks. A waiting tab reloads the newest draft before becoming editable. Project inputs are versioned and validated, with a 5 MB import limit and a 20,000-element document limit.

**Recovery is not an independent backup.** Clearing site data or an application profile can erase local drafts and snapshots. Use Save/Export to keep `.scripy` copies outside the app. Files are plain-text JSON, not encrypted. No accounts, cloud sync, AI calls, or application telemetry are implemented.

## Verification

Results, repaired defects, coverage, and remaining release boundaries are recorded in [docs/release-verification.md](docs/release-verification.md).

```sh
npm run build
npm run lint
npm test
npx playwright install chromium  # One-time browser-test setup
npm run test:e2e
npm run test:desktop             # Requires a graphical display
npm run test:native              # Native open/save/restart/conflict workflows
npm run test:portable            # Verify the built archive in a fresh location/profile, offline
npm run format:check
```

Unit tests cover the document format, keyboard commands, pagination, recovery storage, native backups, write ordering, and external-file conflicts. Browser tests cover writing, undo, note preservation, immediate recovery, import validation, search, outline moves, snapshots, tab handoff, mobile drawers, parsed PDF output, and typing in a 67-page fixture. The desktop smoke test uses a temporary profile and checks renderer isolation, disk saving, PDF export, and close-time flushing.

Additional control regressions cover all seven element selectors and shortcuts, autocomplete and focus, preferences, project metadata, every export format, single-match replacement, dynamic search counts, continued-dialogue page indicators, clipboard metadata validation, blank titles, and 320 px layouts. Native tests cover direct file launch, real paths, Save As cancellation, uppercase extensions, external changes, recent-file refresh, disk-backed recovery restore, restart, and moved files. These are scoped release checks, not a guarantee of zero defects or a certification for untested platforms.

## Architecture

| File                                                 | Responsibility                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| [src/lib/screenplay.ts](src/lib/screenplay.ts)       | Document validation, Fountain interchange, scene operations |
| [src/lib/layout.ts](src/lib/layout.ts)               | Shared wrapping, page breaks, and continuation markers      |
| [src/editor/model.ts](src/editor/model.ts)           | ProseMirror schema, stable identities, screenplay commands  |
| [src/editor/pagination.ts](src/editor/pagination.ts) | Live page-break decorations                                 |
| [src/lib/useDocument.ts](src/lib/useDocument.ts)     | Save ordering, tab ownership, recovery, note retention      |
| [src/lib/storage.ts](src/lib/storage.ts)             | Transactional IndexedDB persistence and snapshots           |
| [src/lib/pdf.ts](src/lib/pdf.ts)                     | Lazy PDF generation with embedded fonts                     |
| [electron/main.cjs](electron/main.cjs)               | Sandboxed window, local asset protocol, guarded IPC         |
| [electron/files.cjs](electron/files.cjs)             | Atomic disk writes and external-edit protection             |

ProseMirror owns the editing DOM; React renders the surrounding workspace. Nonessential document summaries are lower-priority updates. PDF generation loads only when exporting. Fonts and the sample reference image are bundled locally.

## First-Release Limits

The prioritized feature inventory and acceptance criteria for a complete professional workflow are in [docs/professional-roadmap.md](docs/professional-roadmap.md). Items marked as missing are not implemented by this release.

This is a working writing-and-export foundation, not a production revision-management system. Final Draft `.fdx` interchange, dual-dialogue layout, revision colors, locked pages, collaboration, cloud backups, and production reports are not implemented.

Fountain interchange handles screenplay text and basic title/author metadata. Inline emphasis remains literal text; shots export as action. Advanced constructs such as notes, sections, forced page breaks, and dual-dialogue positioning are not preserved. Keep the source file and use `.scripy` for complete project metadata and notes. PDF layout is tuned for Latin-script Courier Prime; complex scripts and exact Final Draft pagination equivalence are not certified.

Linux desktop execution is tested locally. Windows/macOS targets are configured, but their installers, code signing, and platform behavior need validation before distribution.

## Assets

- Courier Prime, DM Sans, and Newsreader: SIL Open Font License. The PDF font license is included in [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Icons and the rendered app icon: [Lucide](https://lucide.dev), ISC license.
- Sample city photograph: [Unsplash](https://images.unsplash.com/photo-1449824913935-59a10b8d2000), bundled as a visual reference.
- The Quiet Hours sample screenplay is original demonstration content created for this project.
