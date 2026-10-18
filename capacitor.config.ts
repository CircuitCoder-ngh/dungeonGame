import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.circuitcoder.dungeondelve',
  appName: 'Dungeon Delve',
  webDir: 'dist',
  backgroundColor: '#0b0a10',
  android: {
    backgroundColor: '#0b0a10',
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Fullscreen immersive game: MainActivity hides the status/navigation bars and
      // draws into the display cutout. 'disable' stops Capacitor from padding the
      // WebView by the cutout/bar insets, so the WebView always covers the whole
      // screen. The page (viewport-fit=cover) should use env(safe-area-inset-*) to
      // keep HUD elements clear of the camera cutout.
      insetsHandling: 'disable',
      // Must be true: with false, Capacitor re-shows the bars right after startup.
      hidden: true,
      // Light icons if the bars are temporarily revealed over the dark game.
      style: 'DARK',
    },
  },
};

export default config;
