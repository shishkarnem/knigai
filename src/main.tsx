import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      for (const reg of regs) {
        const scriptUrl =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (scriptUrl.includes('dev-sw.js')) {
          reg.unregister().catch(() => {});
        }
      }
    })
    .catch(() => {});

  if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onRegisterError(err) {
        console.warn('[KnigAI PWA] SW registration notice:', err);
      },
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
