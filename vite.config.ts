import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/dungeonGame/),
// inside the Android app (Capacitor), and from any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
