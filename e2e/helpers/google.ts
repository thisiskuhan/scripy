import type { BrowserContext, Page } from '@playwright/test'

export async function mockGoogle(
  page: Page | BrowserContext,
  options: { scope?: string; expiresIn?: number; popupError?: boolean; userStatus?: number } = {},
) {
  const account = {
    sub: 'test-writer',
    name: 'Test Writer',
    email: 'writer@example.com',
    email_verified: true,
  }
  const response = {
    access_token: 'scripy-e2e-token',
    expires_in: options.expiresIn ?? 3600,
    scope: options.scope ?? 'openid email profile https://www.googleapis.com/auth/drive.file',
    token_type: 'Bearer',
  }
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { accounts: {
      id: { disableAutoSelect() {} },
      oauth2: { initTokenClient(config) {
        window.__googleRequestedScope = config.scope;
        return { requestAccessToken() {
          ${options.popupError ? 'config.error_callback({type: "popup_closed"});' : `config.callback(${JSON.stringify(response)});`}
        } };
      } }
    } };`,
    }),
  )
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', (route) =>
    route.fulfill({
      status: options.userStatus ?? 200,
      json: account,
    }),
  )
  return account
}

export async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await page.locator('.screenplay-editor[contenteditable="true"]').waitFor()
}
