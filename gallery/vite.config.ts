import { defineConfig } from 'vite';

// Run from the repository root: `vite --config gallery/vite.config.ts`. The paths are relative to it.
export default defineConfig({
  root: 'gallery',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
