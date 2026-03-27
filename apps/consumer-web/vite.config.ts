import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['react-markdown'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-markdown'],
  },

  server: {
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
})
