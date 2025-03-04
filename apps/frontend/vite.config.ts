import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/agents': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  }
});