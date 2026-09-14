# Scripy Document Format, Version 3

The editable native document uses the **`.scripy`** extension and the Linux MIME type `application/x-scripy-screenplay`. Its contents are UTF-8 JSON. UTF-8 byte order marks and uppercase `.SCRIPY` extensions are accepted. PDF is an output format, not an editable project. Fountain is text interchange and does not retain all project metadata.

```json
{
  "version": 3,
  "id": "example-screenplay",
  "title": "The Morning Train",
  "author": "A. Writer",
  "draft": "First draft",
  "logline": "Two people meet on the first train of the morning.",
  "createdAt": "2026-09-14T08:00:00.000Z",
  "updatedAt": "2026-09-14T08:00:00.000Z",
  "blocks": [
    { "id": "scene-one", "kind": "scene", "text": "INT. TRAIN - DAWN" },
    { "id": "action-one", "kind": "action", "text": "The carriage is almost empty." }
  ],
  "notes": { "scene-one": "A quiet opening." },
  "annotations": [],
  "paperSize": "a4",
  "titleArtwork": null
}
```

The writer validates every imported document before switching away from the current draft. Unsupported versions, missing required data, duplicate element IDs, unknown element kinds, and malformed notes are rejected. A rejected import does not bind its path for autosave.

Identifiers matching inherited JavaScript object properties, such as `__proto__`, `constructor`, or `toString`, are reserved and rejected. Normal Scripy-generated identifiers are UUIDs.

## Fields

| Field                    | Meaning and limits                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `version`                | Integer `3`; version-1 and version-2 documents are migrated on open.                  |
| `id`                     | Stable screenplay identifier, 1-100 ASCII letters, digits, underscores, or hyphens.   |
| `title`                  | Nonblank title, at most 300 characters.                                               |
| `author`                 | Author name, at most 300 characters; empty is allowed.                                |
| `draft`                  | Draft label, at most 100 characters.                                                  |
| `logline`                | At most 5,000 characters.                                                             |
| `createdAt`, `updatedAt` | Timestamps emitted as ISO 8601 UTC strings.                                           |
| `blocks`                 | 1-20,000 ordered screenplay elements.                                                 |
| `blocks[].id`            | Unique stable identifier, with the same character/length rules as `id`.               |
| `blocks[].kind`          | `scene`, `action`, `character`, `dialogue`, `parenthetical`, `transition`, or `shot`. |
| `blocks[].text`          | Plain text, at most 100,000 characters per element. No HTML is executed.              |
| `notes`                  | Map from existing block IDs to strings of at most 20,000 characters.                  |
| `annotations`            | Up to 2,000 passage notes with department, tag, status, and text-anchor metadata.     |

Files are limited to 5 MB on import and native save. The canonical emitted shape is described by [scripy.schema.json](scripy.schema.json). The application additionally enforces uniqueness of block IDs and membership of note keys in those IDs, which JSON Schema alone does not express here.

## Paper and Title Artwork

`paperSize` is `letter` (8.5 x 11 inches) or `a4` (210 x 297 mm). It controls live pagination and every exported PDF page, including the title page. The existing screenplay margins and 12-point Courier Prime are preserved; the usable line count and full-width element wrapping adjust to the sheet size.

`titleArtwork` is `null` by default. Otherwise it contains `{ name, dataUrl, width, height }`. New PNG, JPG, and JPEG uploads must be exactly 1920 x 1080 (1080p) or 3840 x 2160 (4K), with a 16:9 landscape ratio, and strictly smaller than 3 MB (3,000,000 bytes). They are decoded locally, resized to at most 1,600 pixels on their longest side, and re-encoded as a PNG below 3 MB while preserving 16:9. The stored dimensions must match the PNG header. Embedded images may be up to 1,600 pixels and 4.5 MB. Remote URLs, SVG, unsupported formats, and image block elements are rejected. The image is drawn only above the title on the optional title page; disabling that page omits the image entirely. Fountain exports contain no artwork.

The image is embedded, not linked to its source path, so native save/open, recovery, and moving the document retain it. The total 5 MB file limit includes the encoded image. Replace/remove/cancel operations are available in document details.

## Passage Notes

Each annotation contains `id`, `quote`, `text`, `departments`, `tags`, `resolved`, `ranges`, `createdAt`, and `updatedAt`. Quote and note text must be nonblank and at most 20,000 characters each. Departments and tags are free-form: a note can carry up to 30 departments and up to 12 tags, each at most 40 characters. Seventeen standard production departments are offered as suggestions, and custom departments are allowed; departments keep their case while their whitespace is trimmed and collapsed, and tags are additionally lowercased. In the note editor, typing `/` suggests and assigns departments and `#` suggests, assigns, or creates tags.

Each range is `{ blockId, from, to }` using zero-based, half-open UTF-16 offsets in that block's stored text. A note can cover up to 200 ranges, including multiple paragraphs. Anchors move with ProseMirror edits, splits, scene reordering, and text undo/redo. If the marked text is removed, the note remains with an empty `ranges` array and its last saved quote; it can be reattached to a new selection. Notes and anchors are included in native files, autosave, and recovery snapshots. They do not appear in PDF or Fountain screenplay output.

## Compatibility

Version-1 files open with `paperSize: "letter"` and `titleArtwork: null`; their IDs, text, and scene notes are preserved. Version-2 files retain paper size and artwork. Both migrate to an empty `annotations` array, including when restored from older recovery snapshots. Saving writes version 3. Older Scripy builds reject version 3 instead of opening and silently dropping passage notes. Use the current app for editing; use PDF or Fountain for text-only interchange with older tools. Native saves continue to preserve the prior `.bak` file.

## Locations and Backups

The path is **not embedded in the screenplay**. A document can be copied, moved, or sent to another machine without carrying an obsolete location. Scripy records the user-selected path separately in its local profile, and opening a file binds the actual location that was selected. Save As updates the current association. A copied file retains its screenplay ID, so copies are treated as versions of the same screenplay in the local library; use New screenplay for an independent project.

Before replacing a draft, Scripy checkpoints the prior local version. Native saves preserve a previous-version `.scripy.bak` file. Recovery snapshots and backups are not an off-device backup system, and documents are not encrypted. Keep independent copies for important work.
