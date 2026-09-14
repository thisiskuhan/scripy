export const CLOUD_FEATURES_ENABLED = false

export const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() || ''

function downloadUrl(value: string | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

export const DESKTOP_APP_URL = downloadUrl(import.meta.env?.VITE_DESKTOP_APP_URL)

export const DESKTOP_DOWNLOADS = {
  windows: downloadUrl(import.meta.env?.VITE_DESKTOP_URL_WINDOWS),
  mac: downloadUrl(import.meta.env?.VITE_DESKTOP_URL_MAC),
  linuxAppImage: downloadUrl(import.meta.env?.VITE_DESKTOP_URL_LINUX_APPIMAGE),
  linuxDeb: downloadUrl(import.meta.env?.VITE_DESKTOP_URL_LINUX_DEB),
}
