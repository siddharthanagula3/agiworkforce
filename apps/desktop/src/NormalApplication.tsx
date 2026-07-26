import { useEffect } from 'react';
import App from './App';
import { Toaster } from './components/ui/Toaster';
import { TooltipProvider } from './components/ui/Tooltip';
import { I18nProvider } from './providers/I18nProvider';
import { ThemeProvider, useThemeContext } from './providers/ThemeProvider';
import { errorTracking, setupGlobalErrorHandler } from './services/errorTracking';
import { getThemeById } from './themes';
import { Toaster as SonnerToaster } from 'sonner';

/**
 * Resolves the app's current theme (base 'dark'/'light'/'system', or a named
 * custom theme ID from the theme registry) to sonner's `theme` prop shape.
 */
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

/**
 * Everything in the normal application is held behind the native startup
 * gate. Keeping this module lazy prevents import-time analytics, feature-flag,
 * store, and App initialization from invoking missing native state while the
 * encrypted database is in recovery.
 */
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
