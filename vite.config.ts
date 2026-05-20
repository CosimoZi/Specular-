import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// GitHub Pages serves at /<repo>/, so build with that base.
// Override via VITE_BASE (e.g. "/" for a user/org site or custom domain).
const base = process.env.VITE_BASE ?? '/specular/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
