import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Repo name = Slingshot. Project Pages serve at /<repo>/.
// Switch to '/' if a custom domain or user/org Pages site is ever used.
export default defineConfig({
  base: '/Slingshot/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        // The game (index.html) plus the Flight Test Lab sandbox (test.html).
        main: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, 'test.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
