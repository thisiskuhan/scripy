import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = fileURLToPath(new URL('../', import.meta.url))
const publicDirectory = path.join(root, 'public')
const sourcePath = path.join(publicDirectory, 'images', 'scripy-s.png')
const source = await fs.readFile(process.argv[2] ? path.resolve(process.argv[2]) : sourcePath)
const image = sharp(source).rotate()
const metadata = await image.metadata()
if (metadata.format !== 'png' || metadata.width !== metadata.height)
  throw new Error('Provide the square PNG Scripy logo.')

await fs.mkdir(path.dirname(sourcePath), { recursive: true })
if (process.argv[2]) await fs.writeFile(sourcePath, source)
const icons = new Map()
for (const size of [16, 32, 48, 180]) {
  const buffer = await image.clone().resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  icons.set(size, buffer)
  if (size !== 48)
    await fs.writeFile(
      path.join(publicDirectory, size === 180 ? 'apple-touch-icon.png' : `favicon-${size}x${size}.png`),
      buffer,
    )
}
await fs.writeFile(
  path.join(publicDirectory, 'favicon.ico'),
  await pngToIco([icons.get(16), icons.get(32), icons.get(48)]),
)
console.log('Generated 16px/32px PNG, 16px/32px/48px ICO, and 180px Apple touch icons.')
