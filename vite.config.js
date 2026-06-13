import { defineConfig } from 'vite';

// Relative base so the built game can be hosted from any sub-path
// (GitHub Pages, itch.io, a plain static server, etc.).
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
});
