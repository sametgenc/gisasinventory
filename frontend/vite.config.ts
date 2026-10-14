import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
import path from "path"

const demoApiTarget = process.env.DEMO_API_TARGET

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    TanStackRouterVite(),
    tailwindcss(),
    react()
  ],
  server: {
    allowedHosts: [process.env.DOMAIN || 'localhost'],
    host: true,
    strictPort: true,
    port: 5173,
    watch: {
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
    // Docker uses the HTTPS proxy; a direct local Vite session uses its own port.
    hmr: process.env.DOMAIN ? { clientPort: 443 } : undefined,
    proxy: demoApiTarget ? Object.fromEntries(
      ['/api', '/_allauth', '/admin', '/static', '/media', '/demo'].map(prefix => [prefix, {
        target: demoApiTarget,
        // Preserve the browser's Host and Origin for Django's session/CSRF checks.
        changeOrigin: false,
      }]),
    ) : undefined,
  },
})
