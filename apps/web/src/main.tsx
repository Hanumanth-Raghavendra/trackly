import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { App } from '@/app/App';
import { applyTheme } from '@/lib/theme';
import { isNative } from '@/lib/platform';

applyTheme();

if (!isNative && import.meta.env.MODE !== 'mobile' && 'serviceWorker' in navigator) {
  // Installable PWA + offline app shell (web only; the Android app bundles its own assets).
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
