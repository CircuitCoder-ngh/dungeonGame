// Service worker registration for offline play / installability (PWA).
// Skipped inside the Capacitor Android app (assets are already bundled) and during
// `vite dev` (a caching SW would fight hot reload).

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function registerPWA(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (cap?.isNativePlatform?.()) return;

  const register = (): void => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch((err: unknown) => console.warn('Service worker registration failed:', err));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
