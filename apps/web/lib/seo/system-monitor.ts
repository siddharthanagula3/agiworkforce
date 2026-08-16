import * as Sentry from '@shared/lib/sentry';
import { logger } from '@shared/lib/logger';

interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
  timeToInteractive: number;
}

class MonitoringService {
  private isInitialized = false;
  private sessionId: string;
  private performanceObservers: PerformanceObserver[] = [];
  private cleanupFns: (() => void)[] = [];

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.setupPerformanceMonitoring();

      this.setupErrorBoundary();

      this.isInitialized = true;
      logger.info('[MonitoringService] Initialized');
    } catch (error) {
      logger.error('[MonitoringService] Failed to initialize:', error);
    }
  }

  setUserContext(user: { id: string; email: string; name?: string }): void {
    Sentry.setUser({ id: user.id, email: user.email, username: user.name });
  }

  clearUserContext(): void {
    Sentry.clearUser();
  }

  trackEvent(eventName: string, _properties?: Record<string, unknown>): void {
    Sentry.addBreadcrumb(eventName, 'ui.click');
    Sentry.captureMessage(eventName, 'info');
  }

  trackPerformance(_metrics: Partial<PerformanceMetrics>): void {
    Sentry.addBreadcrumb('Performance metrics', 'api');
  }

  trackApiCall(endpoint: string, method: string, _statusCode: number, _duration: number): void {
    Sentry.addBreadcrumb(`API ${method} ${endpoint}`, 'api');
  }

  trackUserInteraction(action: string, target: string, properties?: Record<string, unknown>): void {
    this.trackEvent('user_interaction', {
      action,
      target,
      ...properties,
    });
  }

  trackBusinessMetric(metric: string, value: number, properties?: Record<string, unknown>): void {
    this.trackEvent('business_metric', {
      metric,
      value,
      ...properties,
    });
  }

  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              this.trackPerformance({
                largestContentfulPaint: entry.startTime,
              });
            }
          }
        });
        lcpObserver.observe({
          entryTypes: ['largest-contentful-paint'],
        });
        this.performanceObservers.push(lcpObserver);

        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'first-input') {
              const firstInput = entry as PerformanceEventTiming;
              this.trackPerformance({
                firstInputDelay:
                  ((
                    firstInput as PerformanceEventTiming & {
                      processingStart?: number;
                    }
                  ).processingStart as number) - firstInput.startTime,
              });
            }
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.performanceObservers.push(fidObserver);

        const clsObserver = new PerformanceObserver((list) => {
          let cumulativeScore = 0;
          for (const entry of list.getEntries()) {
            if (
              entry.entryType === 'layout-shift' &&
              !(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput
            ) {
              cumulativeScore += (entry as PerformanceEntry & { value?: number }).value as number;
            }
          }
          if (cumulativeScore > 0) {
            this.trackPerformance({
              cumulativeLayoutShift: cumulativeScore,
            });
          }
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.performanceObservers.push(clsObserver);
      } catch (error) {
        logger.warn('[MonitoringService] Performance monitoring setup failed:', error);
      }
    }

    const handleLoad = () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.trackPerformance({
            pageLoadTime: navigation.loadEventEnd - navigation.fetchStart,
            timeToInteractive: navigation.domInteractive - navigation.fetchStart,
          });
        }
      }, 0);
    };
    window.addEventListener('load', handleLoad);
    this.cleanupFns.push(() => window.removeEventListener('load', handleLoad));
  }

  private setupErrorBoundary(): void {
    const handleError = (event: ErrorEvent) => {
      this.captureError(event.error, {
        type: 'javascript_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    window.addEventListener('error', handleError);
    this.cleanupFns.push(() => window.removeEventListener('error', handleError));

    const handleRejection = (event: PromiseRejectionEvent) => {
      this.captureError(event.reason, {
        type: 'unhandled_promise_rejection',
      });
    };
    window.addEventListener('unhandledrejection', handleRejection);
    this.cleanupFns.push(() => window.removeEventListener('unhandledrejection', handleRejection));
  }

  captureError(error: Error, _context?: Record<string, unknown>): void {
    Sentry.captureError(error);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async flush(): Promise<void> {
    await Sentry.flush();
  }

  destroy(): void {
    this.performanceObservers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch (error) {
        logger.warn('[MonitoringService] Failed to disconnect PerformanceObserver:', error);
      }
    });
    this.performanceObservers = [];

    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        logger.warn('[MonitoringService] Failed to run cleanup function:', error);
      }
    });
    this.cleanupFns = [];

    this.isInitialized = false;

    logger.info('[MonitoringService] Destroyed and resources cleaned up');
  }
}

export const monitoringService = new MonitoringService();
