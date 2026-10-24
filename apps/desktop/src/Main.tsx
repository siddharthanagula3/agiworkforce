import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/immerSetup';
import './styles/globals.css';
import { StartupRecoveryBootstrap } from './features/startup-recovery/StartupRecoveryBootstrap';
import { StartupRecoveryLoading } from './features/startup-recovery/StartupRecoveryScreen';

const NormalApplication = React.lazy(() => import('./NormalApplication'));

if (import.meta.env.DEV || import.meta.env.VITE_WDIO_E2E === '1') {
  void import('@wdio/tauri-plugin');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

rootElement.style.width = '100%';
rootElement.style.height = '100%';
rootElement.style.margin = '0';
rootElement.style.padding = '0';
rootElement.style.overflow = 'hidden';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <StartupRecoveryBootstrap>
      <React.Suspense fallback={<StartupRecoveryLoading />}>
        <NormalApplication />
      </React.Suspense>
    </StartupRecoveryBootstrap>
  </React.StrictMode>,
);
