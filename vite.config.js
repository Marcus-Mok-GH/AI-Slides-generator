import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Expose Supabase keys to the frontend without requiring the user to set
// duplicate VITE_ prefixed env vars. Either name works in any environment.
const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  },
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
