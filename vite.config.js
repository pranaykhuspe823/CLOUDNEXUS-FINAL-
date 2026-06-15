import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3006,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      // Billing API must come before /billing to take priority
      '/billing/api': { target: 'http://localhost:3001', changeOrigin: true },
      // Billing frontend (served with base: '/billing/')
      '/billing':     { target: 'http://localhost:3008', changeOrigin: true },
      // Monitoring frontend (served with base: '/monitor/')
      '/monitor':     { target: 'http://localhost:3007', changeOrigin: true },
      // Shared backend routes
      '/api':         { target: 'http://localhost:3001', changeOrigin: true },
      '/auth':        { target: 'http://localhost:3001', changeOrigin: true },
      '/health':      { target: 'http://localhost:3001', changeOrigin: true },
      '/superadmin':  { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io':   { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
})
