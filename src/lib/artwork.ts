import { decode } from 'fast-png'

export const MAX_ARTWORK_BYTES = 4500000
export const MAX_ARTWORK_DIMENSION = 1600
export const MAX_ARTWORK_UPLOAD_BYTES = 3000000
export const ARTWORK_UPLOAD_REQUIREMENTS = 'PNG, JPG, or JPEG, 16:9, 1920 x 1080 or 3840 x 2160, under 3 MB.'
const PNG_PREFIX = 'data:image/png;base64,'
const verifiedImages = new Set<string>()

export interface TitleArtwork {
  name: string
  dataUrl: string
  width: number
  height: number
}

export function validateArtwork(value: unknown): TitleArtwork | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The title-page image is invalid.')
  const image = value as Record<string, unknown>
  if (
    typeof image.name !== 'string' ||
    !image.name.trim() ||
    image.name.length > 200 ||
    typeof image.dataUrl !== 'string' ||
    !image.dataUrl.startsWith(PNG_PREFIX) ||
    typeof image.width !== 'number' ||
    !Number.isInteger(image.width) ||
    image.width < 1 ||
    image.width > MAX_ARTWORK_DIMENSION ||
    typeof image.height !== 'number' ||
    !Number.isInteger(image.height) ||
    image.height < 1 ||
    image.height > MAX_ARTWORK_DIMENSION
  ) {
    throw new Error('The title-page image metadata is invalid.')
  }
  const encoded = image.dataUrl.slice(PNG_PREFIX.length)
  const bytes = (encoded.length / 4) * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
  if (
    encoded.length < 92 ||
    encoded.length % 4 !== 0 ||
    bytes > MAX_ARTWORK_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new Error('The title-page image must be an embedded PNG no larger than 4.5 MB.')
  }
  const header = Uint8Array.from(atob(encoded.slice(0, 44)), (character) => character.charCodeAt(0))
  const data = new DataView(header.buffer)
  if (
    data.getUint32(0) !== 0x89504e47 ||
    data.getUint32(4) !== 0x0d0a1a0a ||
    data.getUint32(8) !== 13 ||
    data.getUint32(12) !== 0x49484452 ||
    data.getUint32(16) !== image.width ||
    data.getUint32(20) !== image.height
  ) {
    throw new Error('The title-page image does not match its PNG dimensions.')
  }
  if (!verifiedImages.has(image.dataUrl)) {
    try {
      const payload = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      decode(payload, { checkCrc: true })
    } catch {
      throw new Error('The title-page image data is corrupted or incomplete. Replace it with a valid PNG.')
    }
    if (verifiedImages.size >= 4) verifiedImages.delete(verifiedImages.values().next().value!)
    verifiedImages.add(image.dataUrl)
  }
  return { name: image.name, dataUrl: image.dataUrl, width: image.width, height: image.height }
}

export async function prepareTitleArtwork(file: File): Promise<TitleArtwork> {
  if (file.size >= MAX_ARTWORK_UPLOAD_BYTES)
    throw new Error('Choose a PNG, JPG, or JPEG image smaller than 3 MB.')
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const png = signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
  const jpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
  if (!png && !jpeg) throw new Error('Only PNG, JPG, and JPEG title-page images are supported.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This image could not be decoded. Choose a valid PNG, JPG, or JPEG.')
  }
  try {
    if (!(
      (bitmap.width === 1920 && bitmap.height === 1080) ||
      (bitmap.width === 3840 && bitmap.height === 2160)
    ))
      throw new Error('Choose a 16:9 image at 1920 x 1080 (1080p) or 3840 x 2160 (4K).')
    const scale = Math.min(1, MAX_ARTWORK_DIMENSION / Math.max(bitmap.width, bitmap.height))
    let width = Math.max(1, Math.round(bitmap.width * scale))
    let height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image processing is unavailable in this browser.')
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/png')
      if (((dataUrl.length - PNG_PREFIX.length) / 4) * 3 < MAX_ARTWORK_UPLOAD_BYTES) {
        return validateArtwork({
          name: file.name.slice(0, 200) || 'Title image.png',
          dataUrl,
          width,
          height,
        })!
      }
      width = Math.max(16, Math.floor((width * 0.65) / 16) * 16)
      height = (width / 16) * 9
    }
    throw new Error('The image could not fit within the document image limit.')
  } finally {
    bitmap.close()
  }
}
