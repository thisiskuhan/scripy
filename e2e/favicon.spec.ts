import { expect, test } from '@playwright/test'
import path from 'node:path'
import sharp from 'sharp'

test('serves correctly sized browser and Apple touch icons', async ({ page, request }) => {
  const source = sharp(path.resolve('public/images/scripy-s.png'))
  await page.goto('/')
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({
      href: (link as HTMLLinkElement).href,
      sizes: link.getAttribute('sizes'),
      type: link.getAttribute('type'),
      rel: link.getAttribute('rel'),
    })),
  )
  expect(icons.map((icon) => icon.sizes)).toEqual(['16x16 32x32 48x48', '16x16', '32x32', '180x180'])
  for (const icon of icons) {
    const response = await request.get(icon.href)
    expect(response.ok()).toBe(true)
    const bytes = await response.body()
    if (new URL(icon.href).pathname.endsWith('.ico')) {
      expect([...bytes.subarray(0, 6)]).toEqual([0, 0, 1, 0, 3, 0])
      expect([0, 1, 2].map((index) => bytes[6 + index * 16])).toEqual([16, 32, 48])
    } else {
      expect(response.headers()['content-type']).toContain('image/png')
      const size = Number(icon.sizes!.split('x')[0])
      expect(bytes.subarray(1, 4).toString()).toBe('PNG')
      expect(bytes.readUInt32BE(16)).toBe(size)
      expect(bytes.readUInt32BE(20)).toBe(size)
      const expectedPixels = await source
        .clone()
        .rotate()
        .resize(size, size, { kernel: 'lanczos3' })
        .raw()
        .toBuffer()
      expect(await sharp(bytes).raw().toBuffer()).toEqual(expectedPixels)
      const decoded = await page.evaluate(async (url) => {
        const image = new Image()
        image.src = url
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      }, icon.href)
      expect(decoded).toEqual({ width: size, height: size })
    }
  }
})
