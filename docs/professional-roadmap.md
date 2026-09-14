# Professional Screenwriting Coverage

This checklist defines the path from the current writing studio to a production-oriented screenwriting application. It is not a claim that every item is implemented. The immediate priorities are trustworthy writing, readable and portable output, and recoverable local work; collaboration and production revisions should not weaken those foundations.

## Available in 0.4

| Area                     | Current capability                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Screenplay editing       | Seven semantic elements, contextual Enter/Tab, character completion, undo/redo, scene recognition, find/replace, spellcheck toggle      |
| Navigation and structure | Scene/character lists, filtering, outline view, scene reordering, scene notes, word counts, rough page-based runtime estimate           |
| Page and title setup     | US Letter and A4 live layout/PDF export, optional title page, optional PNG/JPEG artwork above the title only, author and draft metadata |
| Output                   | Selectable-text PDFs with embedded Courier Prime, scene-number option, dialogue continuations; Fountain text and native Scripy files    |
| Local files              | Persistent paths, Save/Save As, file-manager opening, reveal-in-folder, real disk refresh, conflict detection                           |
| Recovery                 | Autosave, bounded snapshots, manual recovery, previous-file backup, close-time flush, single-writer tab ownership                       |
| Workspace                | Local project library, focus mode, zoom, Light/Dark/System appearance, responsive navigation/notes drawers, offline desktop use         |

## Priority 1: Writing and Interchange

| Missing or incomplete capability | Required acceptance criteria                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final Draft `.fdx` import/export | Round-trip representative scripts, Unicode text, title data, scene numbers, notes, and supported formatting without silent loss; warn for unsupported content |
| Dual dialogue                    | Explicit paired-dialogue model; predictable selection, Enter/Tab, undo, page splitting, and PDF/interchange fidelity                                          |
| Rich screenplay text             | Bold, italic, underline, hard line breaks, escaped Fountain syntax, and loss-aware import/export                                                              |
| More completion tools            | Location/time-of-day suggestions, extensions such as V.O./O.S., and controllable auto-format behavior                                                         |
| Writing ergonomics               | Keyboard shortcut reference/customization, spellcheck dictionaries, accessible toolbar/menu navigation, native print workflow                                 |
| Title-page metadata              | Contact details, copyright/date fields, optional subtitle, and predictable long-text placement                                                                |

## Priority 2: Production Revisions

| Missing capability         | Required acceptance criteria                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Revision sets and colors   | Track inserted/deleted text, revision marks and dates; survive save, undo, imports, and PDF export                  |
| Locked pages and A/B pages | Preserve production pagination after edits, distinguish inserted/omitted pages, and validate page-number continuity |
| Scene-number locking       | Inserted A/B scenes, omitted scenes, manual numbering, and stable numbers after reordering                          |
| Draft comparison           | Side-by-side or marked differences, review/accept/reject, and recovery before destructive actions                   |
| Production reports         | Character/location/scene reports, dialogue extraction, breakdown tags, and consistent export totals                 |

## Priority 3: Planning and Review

| Missing capability                      | Required acceptance criteria                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Acts, sequences, beats, and index cards | Stable links to scenes, drag/reorder with undo, color/status labels, and portable metadata        |
| Character and research workspace        | Profiles, references, attachments outside the screenplay body, and links that survive scene edits |
| Writing targets                         | Session/daily goals, progress history, and opt-in tracking without blocking writing               |
| Review comments                         | Anchored ranges, threaded comments, resolved states, and edits that do not orphan annotations     |
| Read-through                            | Optional text-to-speech, character voices, controllable pacing, and accessible playback controls  |

## Priority 4: Collaboration and Distribution

| Missing or unverified capability       | Required acceptance criteria                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional backup/synchronization        | Explicit user consent, offline queue, versioned storage, conflict recovery, and tested restore from another machine                                |
| Real-time collaboration                | Proven concurrent-edit engine, permissions, presence, reconnect handling, and no silent overwrite of local work                                    |
| Signed platform releases               | Tested Windows/macOS/Linux installation and file associations, signing/notarization where applicable, safe upgrades and rollback                   |
| Broader language/accessibility support | Complex-script font shaping/PDF, input-method composition, screen-reader audits, large text and high-contrast validation                           |
| Scale and fault testing                | Longer scripts and many projects, disk-full/permission failures, crash/power-loss recovery, and performance budgets across representative hardware |

## Release Rules

- No placeholder control should imply a feature exists. Add visible controls only with working behavior and regression coverage.
- Every persistent document-format change needs explicit migration, forward-version rejection, and round-trip tests.
- Text, notes, images, revision data, and location metadata must not be silently discarded by import/export.
- Shared layout changes need measured editor-to-PDF comparisons at both paper sizes.
- Production readiness is tied to supported platforms and workflows with evidence, not an absolute zero-bug promise.

Recommended next milestone: **Final Draft interchange and dual dialogue**, followed by production revision sets and locked pages. These are separate, substantial changes that need their own document-model and compatibility work.
