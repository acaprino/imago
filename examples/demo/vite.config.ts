import { defineConfig } from 'vite';

// Run from the repository root: `vite --config examples/demo/vite.config.ts`. The paths are relative to it. The port is
// `devUrl` of src-tauri/tauri.conf.json.
export default defineConfig({
  root: 'examples/demo',
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
  server: { host: '127.0.0.1', port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
});
