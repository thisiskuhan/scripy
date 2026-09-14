import { test as base, type Page } from '@playwright/test'
import { sampleScreenplay } from '../src/lib/sample'
import { serializeProject } from '../src/lib/screenplay'

export { expect, type Download, type Page } from '@playwright/test'

export const test = base.extend({
  context: async ({ context }, provideContext) => {
    const enterWorkspace = (page: Page) => {
      page.on('domcontentloaded', () => {
        if (page.url() === 'about:blank') return
        void (async () => {
          const home = page.getByRole('main', { name: 'Scripy home', exact: true })
          await home.waitFor()
          await home.getByRole('status', { name: 'Loading recent screenplays' }).waitFor({ state: 'hidden' })
          const current = home.locator('.home-recent-item[data-current="true"]')
          if (await current.count()) {
            await current.click()
          } else {
            await home.getByRole('button', { name: 'New screenplay', exact: true }).waitFor()
            await page.getByLabel('Open screenplay file', { exact: true }).setInputFiles({
              name: 'sample.scripy',
              mimeType: 'application/json',
              buffer: Buffer.from(serializeProject(sampleScreenplay())),
            })
          }
        })().catch(() => undefined)
      })
    }
    context.on('page', enterWorkspace)
    await provideContext(context)
    context.off('page', enterWorkspace)
  },
})
