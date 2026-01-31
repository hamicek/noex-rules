import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 7227,
    proxy: {
      '/graphql': {
        target: 'http://localhost:7226',
        ws: true,
      },
      '/api': 'http://localhost:7226',
      '/stream': 'http://localhost:7226',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
