import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/kratos': {
        target: 'http://localhost:4433',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kratos/, ''),
      },
      '/api/hydra-admin': {
        target: 'http://localhost:4445',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hydra-admin/, ''),
      },
    },
  },
})
