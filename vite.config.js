import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle analysis — generates stats.html on `npm run build:analyze`
    process.env.ANALYZE && visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split KaTeX into its own chunk (large dependency)
          katex: ['katex'],
          // problems-media.json is already code-split via dynamic import
          // in mediaLoader.js — no manual chunk needed for it.
        },
      },
    },
  },
})
