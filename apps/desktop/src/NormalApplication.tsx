import { useEffect } from 'react';
import App from './App';
import { Toaster } from './ui/Toaster';
import { TooltipProvider } from './ui/Tooltip';
import { I18nProvider } from './providers/I18nProvider';
import { ThemeProvider, useThemeContext } from './providers/ThemeProvider';
import { errorTracking, setupGlobalErrorHandler } from './services/errorTracking';
import { getThemeById } from './themes';
import { Toaster as SonnerToaster } from 'sonner';

function useSonnerTheme(): 'light' | 'dark' | 'system' {
  const { theme } = useThemeContext();
  if (theme === 'light' || theme === 'dark' || theme === 'system') return theme;
  return getThemeById(theme)?.variant ?? 'dark';
}

function AppToasters() {
  const sonnerTheme = useSonnerTheme();
  return (
    <>
      <Toaster />
      {/*
        Several modules call sonner's toast API directly. Its own Toaster is
        intentionally mounted beside the app's custom Toaster.
      */}
      <SonnerToaster richColors position="bottom-right" theme={sonnerTheme} />
    </>
  );
}

export default function NormalApplication() {
  useEffect(() => {
    errorTracking.initialize();
    const teardownGlobalErrorHandler = setupGlobalErrorHandler();
    return () => teardownGlobalErrorHandler?.();
  }, []);

  return (
    <I18nProvider>
      <ThemeProvider defaultTheme="dark" storageKey="agiworkforce-theme">
        <TooltipProvider>
          <App />
          <AppToasters />
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
  );
}
