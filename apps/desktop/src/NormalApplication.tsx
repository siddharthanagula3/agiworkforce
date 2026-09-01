import { useEffect } from 'react';
import App from './App';
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

function AppToaster() {
  const sonnerTheme = useSonnerTheme();
  return <SonnerToaster richColors position="bottom-right" theme={sonnerTheme} />;
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
          <AppToaster />
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
