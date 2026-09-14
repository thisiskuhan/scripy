import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateArtwork } from './artwork'

const png = readFileSync(new URL('../../public/icon.png', import.meta.url))
const artwork = (bytes: Uint8Array) => ({
  name: 'cover.png',
  dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
  width: 512,
  height: 512,
})

describe('embedded image payload integrity', () => {
  it('accepts a real PNG repeatedly without changing its bytes', () => {
    const source = artwork(png)
    expect(validateArtwork(source)).toEqual(source)
    expect(validateArtwork(source)).toEqual(source)
  })

  it('rejects a forged PNG header with no image data', () => {
    const forged = Buffer.concat([png.subarray(0, 33), Buffer.alloc(100)])
    expect(() => validateArtwork(artwork(forged))).toThrow('image')
  })

  it('rejects truncated and checksum-corrupted image payloads', () => {
    expect(() => validateArtwork(artwork(png.subarray(0, png.length - 18)))).toThrow('image')
    const corrupted = Buffer.from(png)
    corrupted[corrupted.indexOf('IDAT') + 12] ^= 0xff
    expect(() => validateArtwork(artwork(corrupted))).toThrow('image')
  })
})
