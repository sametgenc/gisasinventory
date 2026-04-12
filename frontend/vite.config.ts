import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
import path from "path"

declare const process: { env: { [key: string]: string | undefined } };

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
    allowedHosts: [(process.env as any).DOMAIN || 'myproject.co'],
    host: true,
    strictPort: true,
    port: 5173,
    watch: {
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
    hmr: {
      clientPort: 443
    }
  },
})
