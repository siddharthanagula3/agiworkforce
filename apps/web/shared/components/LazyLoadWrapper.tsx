import { Suspense, lazy, ComponentType } from 'react';
import { LazyFallback } from './LazyLoadingFallback';
import { logger } from '@shared/lib/logger';

export const lazyWithRetry = <T extends ComponentType<Record<string, unknown>>>(
  importFunc: () => Promise<{ default: T }>,
) => {
  return lazy(() =>
    importFunc().catch((error) => {
      console.error('Failed to load component:', error);
      // Retry once after a delay
      return new Promise<{ default: T }>((resolve) => {
        setTimeout(() => {
          importFunc()
            .then(resolve)
            .catch((retryError) => {
              // If retry fails, log and show error component
              logger.error('[LazyLoadWrapper] Component load failed after retry', retryError);
              resolve({
                default: (() => (
                  <div className="flex h-screen items-center justify-center bg-background">
                    <div className="text-center">
                      <h2 className="mb-2 text-lg font-semibold text-destructive">
                        Failed to Load Component
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Please refresh the page to try again.
                      </p>
                    </div>
                  </div>
                )) as unknown as T,
              });
            });
        }, 1000);
      });
    }),
  );
};

// Higher-order component for lazy loading with suspense
export const withLazyLoading = <P extends object>(Component: ComponentType<P>) => {
  const WrappedComponent = (props: P) => (
    <Suspense fallback={<LazyFallback />}>
      <Component {...props} />
    </Suspense>
  );
  WrappedComponent.displayName = `withLazyLoading(${Component.displayName || Component.name || 'Component'})`;
  return WrappedComponent;
};
