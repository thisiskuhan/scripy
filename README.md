# Scripy

A local, offline screenplay writing studio built with React, TypeScript, ProseMirror, and Electron. The current edition is intended for desktop distribution. It starts on Home with **New screenplay**, **Open file**, and recent local screenplays. No account, Google Cloud configuration, Drive permission, or internet connection is required.

## Run

Use Node.js 22.14 or newer. Install dependencies once with `npm ci`.

```sh
npm run dev           # http://127.0.0.1:7457/
npm run preview       # Production browser preview on the same port after npm run build
npm run desktop       # Build and launch the standalone desktop app
npm run desktop:dev   # Desktop development with live updates on port 7457
npm run desktop:pack  # Produce release/0.6.1/linux-unpacked/ on Linux
npm run desktop:dist:linux  # Build shareable AppImage and tar.gz artifacts
npm run desktop:install  # Register the app and .scripy file type for your Linux account
npm run desktop:check-association
```

All normal browser development, preview, and desktop-development commands use port **7457** and fail if it is occupied; they do not silently select a different port. Run only one of these servers at a time. Automated browser tests use a separate isolated test port. Use the exact loopback URL above to avoid unrelated apps listening on another localhost address. Browser storage is scoped to the address and port: save a `.scripy` copy in an older tab before moving from a previous URL.

The packaged desktop application works offline, loads bundled files directly, and needs **no HTTP port, dev server, Node.js installation, or source checkout** on the receiving device. It ignores `SCRIPY_DEV_URL` when packaged. Browser and desktop storage are separate. Transfer drafts using a `.scripy` file; application archives do not contain your personal drafts or recovery profile.

The Linux executable is `release/0.6.1/linux-unpacked/scripy`. Keep its directory together and in place after registration. Double-click a `.scripy` file, use Open, or launch `./release/0.6.1/linux-unpacked/scripy "/path/to/My screenplay.scripy"`. Files open in the existing window when Scripy is already running. Close an older Scripy version before using the new build; versioned output does not overwrite a running previous release.

## Sharing a Desktop Build

Distribute the packaged application for each supported OS and architecture, not a hosted account-based editor. The browser development preview uses the same local Home and storage behavior; it is not the current release target. A future website download link can still use `VITE_DESKTOP_APP_URL`, but no deployment variables are needed by the offline desktop build.

The manual **Desktop Builds** GitHub Actions workflow builds and smoke-tests on Linux, Windows, and macOS. It packages Linux x64 AppImage/tar.gz, Windows x64 NSIS, and universal macOS DMG/ZIP artifacts, without publishing a release. Run that workflow and test the produced installers before linking public builds. Its initial artifacts are unsigned; configure Windows signing and macOS signing/notarization for public distribution. This workspace cannot certify Windows/macOS runtime behavior from Linux.

For Linux x64, send either `release/0.6.1/Scripy-0.6.1-linux-x86_64.AppImage` or `release/0.6.1/Scripy-0.6.1-linux-x64.tar.gz`.

- AppImage: mark it executable if file transfer removed that permission, then run it. Some Linux systems require FUSE support; the complete tar archive is an alternative when FUSE is unavailable.
- Portable archive: extract the entire archive and run `scripy` inside it. Do not send or move only the executable; its libraries and `resources` directory must stay together.
- These artifacts target Linux x64 and still require a compatible graphical Linux environment and Electron's system libraries. They are not Windows/macOS installers and are not suitable for ARM devices without a matching build.
- Windows: use `npm run desktop:dist:win` on a Windows build/test machine to produce NSIS installation output. macOS: use `npm run desktop:dist:mac` on macOS to produce DMG/ZIP output. Verify the architecture, signing/notarization, installation, and runtime on each target platform before distribution. Those platforms have not been runtime-tested in this Linux workspace.

`npm run test:portable` extracts the built Linux archive into a new path containing spaces, launches from an unrelated working directory with a fresh profile and networking disabled, and verifies fullscreen, theme, save/reopen, and A4/title-image PDF export. It also supplies an invalid development URL to prove packaged startup does not use it. This simulates transfer on this machine; it is not a test on every receiving device.

## Home and Local Files

Home keeps the movie quote, film attribution, theme switch, and subtle interactive dots. Choose **New screenplay** for an empty document or **Open file** for a `.scripy`, JSON, Fountain, or text file. New installations have an empty library; opening Home or cancelling creation does not save a sample or placeholder document.

**Recent screenplays** lists documents from this device's local workspace, newest first, with a title/author/draft search. It is not a scan of every screenplay on the computer: use Open file for other locations. The editor's **Home** button saves pending changes before returning to the library. Returning to the same local draft keeps the editor's undo history.

Native recent-file opening checks the associated disk file and uses the existing recovery/conflict rules. File associations and command-line file opening still open the requested document directly. Browser preview data and the desktop profile remain separate; transfer a document with a `.scripy` file. Old account-scoped browser databases are retained, not deleted or silently merged into the offline workspace.

The quote changes on each page load. Its pointer-following dot effect is adapted to Scripy's theme from [Aceternity Hero Highlight](https://ui.aceternity.com/components/hero-highlight), uses Motion, and respects reduced-motion preferences.

## Parked Cloud Code

Google authentication, Drive helpers, their tests, and related dependencies are retained for possible future work, but `CLOUD_FEATURES_ENABLED` in `src/lib/deployment.ts` is **false**. Neither native startup nor browser preview mounts the Google provider, requests permissions, or shows sign-in, sign-out, or Drive actions. Supplying a Google client ID does not enable those features.

Do not configure Google Cloud for the current release. Re-enabling a cloud edition would require an explicit code change, restored consent/privacy configuration, live OAuth verification, and rerunning the currently skipped cloud UI tests. Cloud unit tests can still run without real credentials.

## Writing

- Seven screenplay elements: scene heading, action, character, dialogue, parenthetical, transition, and shot.
- Contextual Enter/Tab behavior, undo/redo, automatic `INT.`/`EXT.` recognition, and character completion.
- Scene navigation, filtering, character counts, scene notes, a reorderable outline, and literal find/replace.
- Passage-linked notes with multiple production departments, custom tags, open/resolved status, and a searchable Notes view with department, tag, scene, and status filters.
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
| Ctrl/Cmd+Alt+M      | Add a note to the selected passage                          |
| Ctrl/Cmd+S          | Save pending changes without downloading a copy             |
| F11                 | Toggle fullscreen when no dialog is open                    |
| Escape              | Leave focus mode, close find, or dismiss a drawer           |

Autosave is always on; the toolbar shows save status instead of a Save document button. Ctrl/Cmd+S saves immediately without downloading a copy. The document menu retains file commands including **Save document** and **Save as...** for native location selection. In the browser preview, choose **Download copy**, Export, or Ctrl/Cmd+Shift+S explicitly to download a file. In the desktop app, autosave and Ctrl/Cmd+S also update an already associated file. A new draft is kept in local recovery until you choose a file location using Save As. The footer and window title show the actual native file path; clicking the footer path reveals the file in the file manager. Browser downloads cannot expose absolute local paths.

The expand/shrink button beside the appearance and Focus controls enters or exits fullscreen. F11 toggles it; Escape exits it when no modal dialog is open. In the desktop app, Escape closes an open modal first, leaving fullscreen active until the next Escape. Focus mode is separate and can be combined with fullscreen. Native/window-manager exits update the button state. Browser fullscreen requires permission and a user gesture; it may be unavailable in restricted embeds.

Export offers PDF, Fountain, or a portable Scripy copy. The native format is UTF-8, versioned JSON with a `.scripy` extension. See [docs/file-format.md](docs/file-format.md) and [docs/scripy.schema.json](docs/scripy.schema.json).

Choose **Paper size** in Export or Screenplay details. The setting belongs to the document and changes both live pages and the PDF. In Screenplay details, use **Add image** in the title-page section, then **Save details**. PNG, JPG, and JPEG uploads must be 16:9 at exactly 1920 x 1080 or 3840 x 2160 and strictly smaller than 3 MB (3,000,000 bytes). Accepted images are optimized locally for the title page and embedded; the source image file is not needed afterward. Existing saved artwork remains supported. Leave **Include title page** enabled when exporting to include its artwork. Images cannot be inserted into the screenplay body.

New saves use document format version 3. Existing version-1 and version-2 files and recovery snapshots migrate automatically without passage notes; paper/image settings and scene notes are preserved where present. Older app builds reject the new version rather than discard passage-note data. Keep the current desktop version installed after saving upgraded documents.

Select a word or passage and choose **Add note** in the toolbar or notes panel. Multiple departments and tags can belong to the same note. The **Notes** tab searches note text, selected passages, departments, and tags. Department selections match any selected department; tag selections require every selected tag. Notes can be edited, resolved, deleted after a recovery checkpoint, or opened at their anchored passage. Deleted text leaves the note available under **Text removed** for reattachment. Scene-level notes remain separate. Use `.scripy` for portable note storage; PDF and Fountain exports contain screenplay text without passage-note markup.

## Appearance

Use the moon/sun button beside Focus mode for a quick Light/Dark switch, or choose **Editor preferences > Appearance > Light / Dark / System**. System is the default and follows operating-system changes while the app is open. An explicit Light or Dark choice overrides the OS until changed.

Dark mode uses charcoal surfaces, subdued sage accents, and off-white script text. It covers screenplay pages, sidebars, notes, outline cards, menus, dialogs, form controls, and search highlights. The preference is stored separately from screenplay files, synchronized between browser tabs, and applied before the app loads to avoid a light startup flash. Desktop native appearance and startup background follow the saved choice as well.

Changing appearance does not modify text, page layout, selection, undo history, embedded artwork, or exported PDFs. PDFs and print styling remain light with dark text. Browser and desktop appearance preferences are separate, just like their local workspaces. If appearance storage fails, the current session still changes theme and writing continues, with a visible warning that the preference was not saved.

## Protecting Your Work

Autosave writes validated drafts after a 450 ms idle period, or after at most five seconds of continuous editing when no save is in progress. Writes are serialized; edits made during a slow write are saved next, and the status does not say saved until the current draft has finished saving. This covers screenplay text, scene memos, and committed document/note changes. A synchronous recovery copy protects last-moment edits on reload/close where browser storage permits it. Automatic recovery snapshots are taken at most once per minute during edits; the newest 20 are retained. Recovery history also offers manual snapshots. Restoring first checkpoints the current draft.

Failed saves get up to three automatic retries, with delays of one, two, and four seconds. Persistent failures leave a visible error while keeping the draft editable; **Retry save**, Ctrl/Cmd+S, or a new edit can start saving again. Retries do not create downloaded copies or bypass native external-file checks. Native file autosave is attempted even when local recovery storage fails, but the recovery error remains visible until both required writes succeed. Full disks, denied permissions, unavailable storage, or hardware failure cannot be made impossible; keep independent file backups.

In Electron, saving or opening a native document associates it with its actual disk path across restarts. Startup and recent-project opening read that file from disk. Newer local recovery is used only when the saved file has not changed externally; otherwise the disk version is opened and the previous local draft is checkpointed. Missing or unreadable files leave recovery available, with a visible warning and Save As for a new location.

Autosaves use temporary-file writes, file synchronization, and atomic rename, preserving a `.bak` copy of the previous file. No-change saves do not replace that backup. A short-lived filesystem lock covers the fingerprint check, backup, and replacement so two current Scripy instances cannot save the same path concurrently. SHA-256 content fingerprints reject stale retries and external edits, including same-size changes. A competing save leaves the draft recoverable and offers Retry save or Save As; a lock abandoned by a crashed process expires after 30 seconds without a heartbeat. Do not manually delete an active `.lock` directory. These are cooperative locks: unrelated programs and older Scripy builds do not honor them, and arbitrary network filesystems are not certified. Keep independent backups and use a new Save As path to preserve conflicting versions.

Closing waits for pending saves; a failed save offers a keep-open choice. Opening another native file first flushes the outgoing file, even when both files share a screenplay ID. Reopening the same path reconciles the current draft with disk changes instead of replacing pending edits with stale disk content. File-open requests from a second launch wait until an open dialog is dismissed. If the app's saved-location metadata is damaged, manually opening a valid file repairs its association without deleting the recovery draft.

### Multiple Windows and Browsers

- Tabs and windows on the same site origin in the same browser profile share one workspace-wide Web Lock. Only one can edit; the others may inspect the loaded draft read-only. A waiting tab loads the latest recovery before taking over after the writer closes or leaves. Reader views are not live collaboration and can show an older snapshot until takeover or reload.
- Separate browsers, browser profiles, private sessions, or site origins have separate local storage and locks. They can edit independent copies, even with the same screenplay ID. They do not sync or merge; use an explicit `.scripy` export/import to transfer work. Closing private browsing can discard its storage.
- The browser and Electron desktop app also have independent storage. Browser autosave never updates a desktop file: importing a file creates a browser copy, not a writable disk association.
- Repeated desktop launches with the same application profile reuse one process/window and forward file-open requests. Separately configured profiles can run concurrently; their saves to the same canonical path use the filesystem lock and external-change checks above.
- Browsers without the Web Locks API, or whose lock requests fail, remain read-only with an error rather than enabling uncoordinated writes. Use a current browser on HTTPS or the desktop app.

A renderer crash releases its browser lock, and a successor recovers the last successfully persisted draft. Last-moment recovery on normal navigation/close is best-effort: hard crashes, power loss, or storage failure can lose edits that have not yet reached persistent storage. A passing save state is not a substitute for an independent backup. Project inputs are versioned and validated, with a 5 MB import limit and a 20,000-element document limit.

**Recovery is not an independent backup.** Clearing site data or an application profile can erase local drafts and snapshots. Use Save/Export to keep `.scripy` copies outside the app. Files are plain-text JSON, not encrypted. Accounts and Drive integration are disabled in this edition. Cloud sync, AI calls, and application telemetry are not active.

## Verification

Home checks cover empty startup, create/cancel, validated local import, recent files, search, return-to-editor undo, persistence, responsive layouts, and absence of Google requests. Existing editor fixtures enter through Home with a test screenplay. Google UI tests are retained but skipped while cloud features are disabled; they do not affect offline release verification.

Results, repaired defects, coverage, and remaining release boundaries are recorded in [docs/release-verification.md](docs/release-verification.md).

```sh
npm run build
npm run lint
npm test
npx playwright install chromium  # One-time browser-test setup
npm run test:e2e
npm run test:responsive          # Production build, Chromium/Firefox/WebKit, phone/tablet/desktop sizes
npm run test:desktop             # Requires a graphical display
npm run test:native              # Native open/save/restart/conflict workflows
npm run test:instances           # Real Electron relaunches, browser coexistence, competing-profile saves
npm run test:desktop-ui          # Native shortcuts, responsive controls, isolation, and timing measurements
npm run test:portable            # Verify the built archive in a fresh location/profile, offline
npm run format:check
```

Unit tests cover the document format, keyboard commands, pagination, recovery storage, native backups, write ordering, and external-file conflicts. Browser tests cover writing, undo, note preservation, immediate recovery, import validation, search, outline moves, snapshots, tab handoff, mobile drawers, parsed PDF output, and typing in a 67-page fixture. The desktop smoke test uses a temporary profile and checks renderer isolation, disk saving, PDF export, and close-time flushing.

The responsive suite requires `npx playwright install chromium firefox webkit` and each browser's system libraries. It tests nine viewports from 320px to 1920px, touch input, rotation, reduced viewport height, notes/filter menus, file save/reopen, PDFs, and favicon assets. Use `-- --project chromium --project firefox` to run only those installed engines. These are browser-emulation checks, not physical-device certification.

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

- Browser and Apple touch icons use the supplied Scripy artwork in [public/images/scripy-mark.png](public/images/scripy-mark.png). Regenerate the favicon set with `npm run icons:generate`; the in-app wordmark and native application icon remain independent.
- Courier Prime, DM Sans, and Newsreader: SIL Open Font License. The PDF font license is included in [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Icons and the rendered app icon: [Lucide](https://lucide.dev), ISC license.
- Sample city photograph: [Unsplash](https://images.unsplash.com/photo-1449824913935-59a10b8d2000), bundled as a visual reference.
- The Quiet Hours sample screenplay is original demonstration content created for this project.
