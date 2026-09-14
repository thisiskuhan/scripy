import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { include: ['jspdf'] },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1',
    port: 7457,
    strictPort: true,
    watch: { ignored: ['**/release/**', '**/test-results/**', '**/playwright-report/**'] },
  },
  preview: { host: '127.0.0.1', port: 7457, strictPort: true },
})
