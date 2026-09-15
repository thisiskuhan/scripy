# Scripy

I couldn't find a free, proper scriptwriter, so I made this.

A local-first screenplay editor for the browser and desktop. No account required. The desktop app works offline.

## Write

- Screenplay formatting, scene navigation, and a reorderable outline.
- Scene notes and passage-linked notes with departments and tags.
- Autosave, recovery history, focus mode, and light/dark themes.
- PDF export with Letter/A4 pages and optional title-page artwork.
- Portable `.scripy` files and Fountain import/export.

Your drafts stay on your device, not in a cloud account. Browser and desktop drafts are separate. **Export `.scripy` backups:** clearing site data can erase browser drafts, and local recovery is not a backup. In the desktop app, use **Save as** once to choose a file location.

## Run Locally

Use Node.js 22.14 or newer.

```sh
npm ci
npm run dev
```

Open [localhost on port 7457](http://127.0.0.1:7457/). The dev server will fail if that port is occupied.

For the desktop app, run `npm run desktop`. Build packages on their target OS with `npm run desktop:dist:linux`, `npm run desktop:dist:win`, or `npm run desktop:dist:mac`. Windows/macOS installers and signing still need platform validation.

## Development

Built with React, TypeScript, ProseMirror, Vite, and Electron.

```sh
npm run lint
npm test
npm run build
```

More detail: [file format](docs/file-format.md), [roadmap](docs/professional-roadmap.md), and [verification notes](docs/release-verification.md).

## Credits

- Courier Prime, DM Sans, and Newsreader: SIL Open Font License; [bundled PDF font license](public/fonts/OFL.txt).
- Interface icons: [Lucide](https://lucide.dev), ISC license.
- Highlight effect inspired by [Aceternity Hero Highlight](https://ui.aceternity.com/components/hero-highlight).
- Sample city photograph: [Unsplash](https://images.unsplash.com/photo-1449824913935-59a10b8d2000).
- Scripy logo artwork: supplied with permission; Canva template assets retain their original terms.
- The Quiet Hours is original demo screenplay content created for this project.

Project code is [MIT licensed](LICENSE). Third-party components, fonts, images, logo assets, and movie quotations retain their own licenses and rights.
