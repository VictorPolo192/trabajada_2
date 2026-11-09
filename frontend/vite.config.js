import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite redirige /api al backend Express (puerto 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
