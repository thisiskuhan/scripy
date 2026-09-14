import sharp from 'sharp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MAX_ARTWORK_UPLOAD_BYTES, prepareTitleArtwork } from './artwork'

let normalizedPng: string

beforeAll(async () => {
  const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#243b40' } })
    .png()
    .toBuffer()
  normalizedPng = `data:image/png;base64,${bytes.toString('base64')}`
})

afterEach(() => vi.unstubAllGlobals())

function imageFile(size = 100) {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new File([bytes], 'title.png', { type: 'image/png' })
}

function bitmap(width: number, height: number) {
  const close = vi.fn()
  const decode = vi.fn().mockResolvedValue({ width, height, close })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL: () => normalizedPng,
  }
  vi.stubGlobal('createImageBitmap', decode)
  vi.stubGlobal('document', { createElement: () => canvas })
  return { close, decode }
}

describe('title artwork upload constraints', () => {
  it.each([
    [1920, 1080],
    [3840, 2160],
  ])('accepts %i x %i and preserves 16:9 during embedding', async (width, height) => {
    const { close } = bitmap(width, height)
    const result = await prepareTitleArtwork(imageFile())
    expect(result).toMatchObject({ name: 'title.png', width: 1600, height: 900 })
    expect(result.width / result.height).toBe(16 / 9)
    expect(close).toHaveBeenCalledOnce()
  })

  it.each([
    [512, 512],
    [1280, 720],
    [2560, 1440],
    [4096, 2160],
    [1080, 1920],
    [1920, 1200],
  ])('rejects unsupported %i x %i images and releases their bitmap', async (width, height) => {
    const { close } = bitmap(width, height)
    await expect(prepareTitleArtwork(imageFile())).rejects.toThrow('1920 x 1080 (1080p) or 3840 x 2160 (4K)')
    expect(close).toHaveBeenCalledOnce()
  })

  it.each([MAX_ARTWORK_UPLOAD_BYTES, MAX_ARTWORK_UPLOAD_BYTES + 1])(
    'rejects %i bytes before decoding',
    async (size) => {
      const { decode } = bitmap(1920, 1080)
      await expect(prepareTitleArtwork(imageFile(size))).rejects.toThrow('smaller than 3 MB')
      expect(decode).not.toHaveBeenCalled()
    },
  )

  it('accepts a file one byte below 3 MB', async () => {
    bitmap(1920, 1080)
    await expect(prepareTitleArtwork(imageFile(MAX_ARTWORK_UPLOAD_BYTES - 1))).resolves.toMatchObject({
      width: 1600,
      height: 900,
    })
  })

  it('rejects unsupported file content before image decoding', async () => {
    const { decode } = bitmap(1920, 1080)
    await expect(prepareTitleArtwork(new File(['<svg></svg>'], 'cover.png'))).rejects.toThrow(
      'Only PNG, JPG, and JPEG',
    )
    expect(decode).not.toHaveBeenCalled()
  })
})
