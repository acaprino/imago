import { defineConfig } from 'vite';

const page = (name: string): string => new URL(name, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Run from the repository root: `vite --config examples/demo/vite.config.ts`. The paths are relative to it. The port is
// `devUrl` of src-tauri/tauri.conf.json.
export default defineConfig({
  root: 'examples/demo',
  base: './',
  // Two pages: the demo's window, and a second window of it (secondary.html).
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500, rollupOptions: { input: { main: page('./index.html'), secondary: page('./secondary.html') } } },
  server: { host: '127.0.0.1', port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
});
