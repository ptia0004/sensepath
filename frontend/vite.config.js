import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base works for GitHub Pages (/sensepath/) and Cloud Run (/)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5001',
    },
  },
})
