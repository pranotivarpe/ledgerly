import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: they change rarely, so browsers keep them cached across deploys.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              priority: 3,
            },
            {
              name: 'data',
              test: /node_modules[\\/](@tanstack|zod|react-hook-form|@hookform)[\\/]/,
              priority: 2,
            },
            {
              name: 'ui',
              test: /node_modules[\\/](@radix-ui|lucide-react|sonner|@floating-ui)[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});
