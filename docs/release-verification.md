# Scripy 0.4.0 Release Verification

Date: 2026-09-14. Scope: Linux x64 desktop, Chromium browser, local `.scripy` workflows, Letter/A4 Latin-script screenplay layout, optional title-page artwork, and Light/Dark/System appearance. Tests use isolated browser contexts or temporary desktop profiles, not the user's working drafts.

## Gates

| Gate                                                     | Result                      |
| -------------------------------------------------------- | --------------------------- |
| TypeScript and production bundle                         | Passed                      |
| ESLint, including desktop code                           | Passed                      |
| Prettier format check                                    | Passed                      |
| Unit and native-file regression tests                    | 54 passed                   |
| Browser workflow tests                                   | 45 passed                   |
| Packaged desktop save/PDF/close smoke test               | Passed                      |
| Packaged native open/restart/conflict/recovery workflows | Passed                      |
| Linux MIME recognition and actual `xdg-open` routing     | Passed                      |
| npm runtime dependency audit                             | No reported vulnerabilities |

The 1,200-element, 67-page typing fixture completed 17 automated keystrokes in approximately 0.5 seconds during the full browser run. This is a local test measurement, not a guarantee for other documents or machines.

## Appearance

- Light/Dark/System radio controls and the quick moon/sun button update the entire workspace, including dark screenplay pages, outline, notes, search, menus, dialogs, and title-page previews.
- Saved preferences survive browser reload and desktop restart. System responds to OS changes; explicit choices override the OS. Browser tabs synchronize appearance without changing the shared draft.
- A blocking local startup script applies the preference before the application module loads. A test holds that module unloaded and checks the dark root/background, guarding against light startup flashes.
- Measured contrast is at least 7:1 for screenplay text and 4.5:1 for the tested navigation labels, notes, form fields, search matches, and primary controls. Desktop and mobile screenshots at 390 px and 320 px were reviewed for readability and overlap.
- Appearance switching preserves document content, block IDs, and undo behavior. Image bytes are unchanged; PDF generation remains independent of screen colors and print styling stays light.
- Preference-storage failure does not block the session theme change or writing. Desktop theme persistence is serialized separately from screenplay saves, and native appearance follows the selected source.

## A4 and Title Artwork

- A4 exports use ISO 210 x 297 mm page boxes for both title and screenplay pages. Letter remains the default for new and migrated version-1 documents.
- Paper size changes live line wrapping and pagination without rebuilding the editor or clearing undo history. Measured paragraph positions and heights match the shared layout model in both formats.
- Fractional Courier Prime advances are preserved with precision text rendering; this prevents browser font hinting from rounding a 9.6 px character to 10 px and drifting from the PDF layout.
- PNG/JPEG uploads are decoded locally and normalized into bounded embedded PNGs. Invalid, unsupported, oversized, remote, and dimension-mismatched images are rejected.
- PDF operator and text-coordinate checks verify the image is above the title on page one only, absent from all screenplay pages, and absent entirely when the title page is excluded.
- Image replacement, removal, cancellation, native document export/import, reload, desktop save/restart, and mobile dialog layout are covered. No image element is admitted to the screenplay body.
- Format version 2 preserves paper size and artwork. Version-1 migration preserves existing IDs, text, and notes; older apps reject version 2 instead of silently stripping new fields.

## File Workflows

- Save and Save As use the chosen native path; the footer and window title expose that path.
- The path remains associated after restarting. Opening through the project library reads the real file.
- Direct launch, uppercase extensions, spaces in paths, file URLs, and opening into an already-running app are covered.
- Linux recognizes `application/x-scripy-screenplay`; the registered launcher was exercised through `xdg-open` against the packaged executable.
- Save As cancellation leaves the original binding intact. Save As also works when the original file changed externally or was moved.
- Disk changes are detected using content hashes, not only size or timestamps. Repeated unchanged saves retain the previous-version backup.
- A changed disk file takes precedence on reopen, with the older local draft retained in recovery. A newer crash-recovery draft is used only when the disk file has not changed externally.
- Invalid imports do not replace or bind the current document. UTF-8 BOMs are accepted. Reserved object-property IDs are rejected.
- Corrupt saved-location metadata does not prevent manually reopening a valid file. Snapshot restoration is subsequently written to the associated native file.

## UI Coverage

The browser suites exercise all seven element selectors and keyboard shortcuts, Enter/Tab editing, undo/redo, character completion, scene and character filtering/navigation, scene creation, outline moves, notes, metadata forms, project switching, preferences, zoom, focus mode, and mobile drawers.

Find/replace coverage includes previous/next, single/all replacement, live match counts, and clearing highlights when dismissed. Export coverage includes Scripy, Fountain, and parsed PDF output, embedded fonts, selectable text, title-page options, scene numbers, and continuation markers. Layouts are checked at desktop, 390 px, and 320 px widths.

This pass repaired six UI defects missed by the earlier suite: invalid middle-block HTML paste could crash pagination; search counts could become stale; toolbar dismissal left highlights; continued dialogue reported the starting page; autocomplete remained open after blur; and whitespace-only titles failed without feedback.

A repeat run also exposed a fast document-end-navigation/Enter race. Document-boundary shortcuts now update the ProseMirror selection synchronously. Its unit regression and eight consecutive browser runs passed without retries.

Screenshot review also caught a long title overlapping Export at 320 px. The title now shrinks within its allocated space, Export retains its width, and the mobile test asserts that their bounding boxes do not overlap.

## Boundaries

Passing tests are not proof of zero defects. This release is verified for the scope above, not certified for every operating system, language, document size, filesystem, or failure condition.

- Windows/macOS installers, signing, notarization, and platform behavior remain unverified.
- Complex-script PDF layout and exact Final Draft pagination equivalence remain unverified.
- Final Draft interchange, dual-dialogue layout, locked pages, production revision tracking, cloud sync, and collaboration are not implemented.
- Advanced Fountain constructs are not preserved; retain the source and use `.scripy` for complete local project data.
- Content-hash checks are not a filesystem lock shared with other programs. Independent backups are still required.

## Reproduce

```sh
npm run build
npm run format:check
npm run lint
npm test
npm run test:e2e -- --workers 1
npm run test:desktop
npm run test:native
npm audit --omit=dev
npm run desktop:pack
npm run desktop:install
npm run desktop:check-association
SCRIPY_TEST_EXECUTABLE="$PWD/release/0.4.0/linux-unpacked/scripy" SCRIPY_TEST_MIME=1 node scripts/verify-native-workflows.mjs
SCRIPY_TEST_EXECUTABLE="$PWD/release/0.4.0/linux-unpacked/scripy" node scripts/smoke-desktop.mjs
```

The desktop checks require a graphical display. Browser tests require the Playwright Chromium runtime. File association registration is per-user and does not require administrator access.
