import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    // Severs the window.opener link from the Replit Workspace tab. Without
    // this, the OIDC consent page on replit.com sees an opener and treats
    // the auth flow like a popup — calling window.close() after Authorize
    // and killing this tab before our /api/callback ever runs.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    hmr: {
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
