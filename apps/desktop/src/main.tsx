import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './providers/ThemeProvider';
import { Toaster } from './components/ui/Toaster';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorTracking, setupGlobalErrorHandler } from './services/errorTracking';

// Required for Zustand + Immer stores that use Map/Set.
enableMapSet();

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
    <ThemeProvider defaultTheme="dark" storageKey="agiworkforce-theme">
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
