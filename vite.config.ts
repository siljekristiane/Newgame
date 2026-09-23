import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the build works from any folder or host.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500, // three.js alone is ~700 kB
  },
});
