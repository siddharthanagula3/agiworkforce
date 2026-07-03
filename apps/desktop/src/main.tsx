import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/immerSetup';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './providers/ThemeProvider';
import { I18nProvider } from './providers/I18nProvider';
import { Toaster } from './components/ui/Toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorTracking, setupGlobalErrorHandler } from './services/errorTracking';

// Initialize error tracking
errorTracking.initialize();
setupGlobalErrorHandler();

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
    <I18nProvider>
      <ThemeProvider defaultTheme="dark" storageKey="agiworkforce-theme">
        <TooltipProvider>
          <App />
          <Toaster />
          {/*
            Second, independent toast surface: several modules (App.tsx,
            packages/unified-chat's AttachmentMenu, apps/desktop's
            useFolderSelection, etc.) call `sonner`'s `toast.*` API directly,
            but sonner's own <Toaster/> was never mounted anywhere in this
            app — those calls previously fired into sonner's global store and
            rendered nothing (confirmed via e2e: `useFolderSelection`'s
            "Folder selection requires the desktop app" toast never
            appeared). Mounting it here is additive and renders independently
            of the custom `useToast`-backed <Toaster/> above.
          */}
          <SonnerToaster richColors position="bottom-right" />
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            data-testid="app-status-live-region"
          >
            AGI is ready.
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
