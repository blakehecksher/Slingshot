import { defineConfig } from 'vite';

// Repo name = Slingshot. Project Pages serve at /<repo>/.
// Switch to '/' if a custom domain or user/org Pages site is ever used.
export default defineConfig({
  base: '/Slingshot/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
