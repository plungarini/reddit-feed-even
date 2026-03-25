import { defineConfig } from 'vite';

// Determine base path based on environment
const getBase = () => {
  // For GitHub Pages production
  if (process.env.GITHUB_PAGES === 'true') {
    return '/reddit-client-even/';
  }
  // For local dev server and Even Hub, use root
  return './';
};

export default defineConfig({
  base: getBase(),
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'even-hub': ['@evenrealities/even_hub_sdk'],
        },
      },
    },
  },
});
