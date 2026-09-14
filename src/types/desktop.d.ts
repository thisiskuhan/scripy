interface DesktopOpenResult {
  name: string
  path: string
  content: string
  token: string | null
}
interface DesktopLocation {
  id: string
  path: string
  name: string
}
interface DesktopReopenResult extends DesktopOpenResult {
  changedOnDisk: boolean
}
interface DesktopOpenRequest {
  file: DesktopOpenResult | null
  error: string | null
}
interface DesktopSaveResult {
  path: string
  saved: boolean
}
interface ScripyDesktop {
  platform: string
  setAppearance(preference: 'light' | 'dark' | 'system'): Promise<boolean>
  getFullscreen(): Promise<boolean>
  setFullscreen(fullscreen: boolean): Promise<boolean>
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void
  openDocument(): Promise<DesktopOpenResult | null>
  bindDocument(token: string, id: string): Promise<DesktopLocation>
  getLocation(id: string): Promise<DesktopLocation | null>
  reopenDocument(id: string): Promise<DesktopReopenResult | null>
  takeOpenRequest(): Promise<DesktopOpenRequest | null>
  onOpenRequest(callback: () => void): () => void
  revealDocument(id: string): Promise<boolean>
  saveDocument(content: string, suggestedName: string, saveAs?: boolean): Promise<DesktopSaveResult | null>
  autosave(content: string): Promise<boolean>
  exportFile(data: Uint8Array, suggestedName: string, extension: string): Promise<boolean>
  onBeforeClose(callback: () => Promise<boolean>): () => void
}
interface Window {
  scripyDesktop?: ScripyDesktop
}
