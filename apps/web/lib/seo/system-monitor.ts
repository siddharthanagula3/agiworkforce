import * as Sentry from '@shared/lib/sentry';
import { logger } from '@shared/lib/logger';

// Performance monitoring interface
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

  /**
   * Initialize monitoring service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set up performance monitoring
      this.setupPerformanceMonitoring();

      // Set up error boundary
      this.setupErrorBoundary();

      this.isInitialized = true;
      logger.info('[MonitoringService] Initialized');
    } catch (error) {
      logger.error('[MonitoringService] Failed to initialize:', error);
    }
  }

  /**
   * Set user context for error tracking
   */
  setUserContext(user: { id: string; email: string; name?: string }): void {
    Sentry.setUser({ id: user.id, email: user.email, username: user.name });
  }

  /**
   * Clear user context
   */
  clearUserContext(): void {
    Sentry.clearUser();
  }

  /**
   * Track custom events
   */
  trackEvent(eventName: string, _properties?: Record<string, unknown>): void {
    Sentry.addBreadcrumb(eventName, 'ui.click');
    Sentry.captureMessage(eventName, 'info');
  }

  /**
   * Track performance metrics
   */
  trackPerformance(_metrics: Partial<PerformanceMetrics>): void {
    Sentry.addBreadcrumb('Performance metrics', 'api');
  }

  /**
   * Track API calls
   */
  trackApiCall(endpoint: string, method: string, _statusCode: number, _duration: number): void {
    Sentry.addBreadcrumb(`API ${method} ${endpoint}`, 'api');
  }

  /**
   * Track user interactions
   */
  trackUserInteraction(action: string, target: string, properties?: Record<string, unknown>): void {
    this.trackEvent('user_interaction', {
      action,
      target,
      ...properties,
    });
  }

  /**
   * Track business metrics
   */
  trackBusinessMetric(metric: string, value: number, properties?: Record<string, unknown>): void {
    this.trackEvent('business_metric', {
      metric,
      value,
      ...properties,
    });
  }

  /**
   * Set up performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    // Monitor Core Web Vitals
    if ('PerformanceObserver' in window) {
      try {
        // Largest Contentful Paint
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

        // First Input Delay
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

        // Cumulative Layout Shift
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

    // Track page load time
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

  /**
   * Set up error boundary
   */
  private setupErrorBoundary(): void {
    // Global error handler
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

    // Unhandled promise rejection handler
    const handleRejection = (event: PromiseRejectionEvent) => {
      this.captureError(event.reason, {
        type: 'unhandled_promise_rejection',
      });
    };
    window.addEventListener('unhandledrejection', handleRejection);
    this.cleanupFns.push(() => window.removeEventListener('unhandledrejection', handleRejection));
  }

  /**
   * Capture error with context
   */
  captureError(error: Error, _context?: Record<string, unknown>): void {
    Sentry.captureError(error);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    await Sentry.flush();
  }

  /**
   * Destroy monitoring service and clean up all resources
   */
  destroy(): void {
    // Disconnect all PerformanceObservers
    this.performanceObservers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch (error) {
        logger.warn('[MonitoringService] Failed to disconnect PerformanceObserver:', error);
      }
    });
    this.performanceObservers = [];

    // Run all cleanup functions (remove event listeners)
    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        logger.warn('[MonitoringService] Failed to run cleanup function:', error);
      }
    });
    this.cleanupFns = [];

    // Reset initialization state
    this.isInitialized = false;

    logger.info('[MonitoringService] Destroyed and resources cleaned up');
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();

// Export Sentry components for React integration
export { Sentry };
