/**
 * Error Tracking Service
 *
 * Sentry integration for error reporting and user feedback
 * Note: Requires @sentry/react and @sentry/tauri to be installed
 */

import { analytics } from './analytics';
import { ErrorEventProperties } from '../types/analytics';

// Import Sentry
import * as Sentry from '@sentry/react';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error tracking configuration
 */
interface ErrorTrackingConfig {
  enabled: boolean;
  dsn?: string;
  environment: 'development' | 'staging' | 'production';
  release?: string;
  sampleRate: number; // 0.0 to 1.0
  tracesSampleRate: number; // 0.0 to 1.0
  attachStacktrace: boolean;
  sendDefaultPii: boolean; // Should be false for privacy
}

class ErrorTrackingService {
  private config: ErrorTrackingConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: false, // Opt-in by default
      environment: 'development',
      sampleRate: 1.0,
      tracesSampleRate: 0.1,
      attachStacktrace: true,
      sendDefaultPii: false, // Privacy-first
    };

    this.loadConfig();
  }

  /**
   * Initialize Sentry
   */
  public initialize() {
    if (this.initialized || !this.config.enabled || !this.config.dsn) {
      return;
    }

    try {
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        release: this.config.release,
        sampleRate: this.config.sampleRate,
        tracesSampleRate: this.config.tracesSampleRate,
        attachStacktrace: this.config.attachStacktrace,
        sendDefaultPii: this.config.sendDefaultPii,
        integrations: [Sentry.browserTracingIntegration()],
        beforeSend(event, _hint) {
          // Filter out sensitive information
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
          }

          // Remove query strings that might contain tokens
          if (event.request?.url) {
            event.request.url = event.request.url.split('?')[0];
          }

          return event;
        },
      });

      this.initialized = true;
      console.log('Error tracking initialized');
    } catch (error) {
      console.error('Failed to initialize error tracking:', error);
    }
  }

  /**
   * Load configuration from storage
   */
  private loadConfig() {
    try {
      const savedConfig = localStorage.getItem('error_tracking_config');
      if (savedConfig) {
        this.config = { ...this.config, ...JSON.parse(savedConfig) };
      }

      // Load DSN from environment variable
      const dsn = import.meta.env['VITE_SENTRY_DSN'];
      if (dsn) {
        this.config.dsn = dsn;
      }

      // Load release version
      const release = import.meta.env['VITE_APP_VERSION'];
      if (release) {
        this.config.release = release;
      }

      // Load environment
      const environment = import.meta.env['MODE'];
      if (environment) {
        this.config.environment = environment as any;
      }
    } catch (error) {
      console.error('Failed to load error tracking config:', error);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ErrorTrackingConfig>) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('error_tracking_config', JSON.stringify(this.config));

    // Reinitialize if enabled state changed
    if (config.enabled !== undefined) {
      if (config.enabled) {
        this.initialize();
      }
    }
  }

  /**
   * Capture an error
   */
  public captureError(
    error: Error,
    context?: {
      component?: string;
      severity?: ErrorSeverity;
      tags?: Record<string, string>;
      extra?: Record<string, any>;
    },
  ) {
    if (!this.config.enabled) {
      console.error(error);
      return;
    }

    try {
      // Track in analytics
      const eventProps: ErrorEventProperties = {
        error_type: error.name,
        error_message: error.message,
        error_stack: error.stack,
        component: context?.component,
        severity: context?.severity || ErrorSeverity.MEDIUM,
        recovered: false,
      };

      analytics.track('error_occurred', eventProps);

      // Send to Sentry
      Sentry.captureException(error, {
        level: this.mapSeverityToLevel(context?.severity),
        tags: context?.tags,
        extra: context?.extra,
        contexts: {
          component: {
            name: context?.component,
          },
        },
      });
    } catch (err) {
      console.error('Failed to capture error:', err);
    }
  }

  /**
   * Capture a message
   */
  public captureMessage(message: string, severity: ErrorSeverity = ErrorSeverity.LOW) {
    if (!this.config.enabled) {
      console.log(message);
      return;
    }

    try {
      Sentry.captureMessage(message, {
        level: this.mapSeverityToLevel(severity),
      });
    } catch (error) {
      console.error('Failed to capture message:', error);
    }
  }

  /**
   * Add breadcrumb for debugging
   */
  public addBreadcrumb(category: string, message: string, data?: Record<string, any>) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.addBreadcrumb({
        category: category,
        message: message,
        data: data,
        timestamp: Date.now() / 1000,
      });
    } catch (error) {
      console.error('Failed to add breadcrumb:', error);
    }
  }

  /**
   * Set user context (non-PII)
   */
  public setUser(userId?: string, userData?: Record<string, any>) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.setUser({
        id: userId,
        ...userData,
      });
    } catch (error) {
      console.error('Failed to set user context:', error);
    }
  }

  /**
   * Set tags for filtering
   */
  public setTags(tags: Record<string, string>) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.setTags(tags);
    } catch (error) {
      console.error('Failed to set tags:', error);
    }
  }

  /**
   * Show user feedback dialog
   */
  public showFeedbackDialog(eventId?: string) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.showReportDialog({
        eventId: eventId,
        title: 'It looks like we encountered an error',
        subtitle: 'Our team has been notified, but you can help us fix it faster.',
        subtitle2: "If you'd like to help, tell us what happened below.",
        labelName: 'Name',
        labelEmail: 'Email',
        labelComments: 'What happened?',
        labelClose: 'Close',
        labelSubmit: 'Submit',
        errorGeneric: 'An unknown error occurred. Please try again.',
        errorFormEntry: 'Some fields were invalid. Please correct them and try again.',
        successMessage: 'Your feedback has been sent. Thank you!',
      });
    } catch (error) {
      console.error('Failed to show feedback dialog:', error);
    }
  }

  /**
   * Start a transaction for performance monitoring
   */
  public startTransaction(name: string, op: string) {
    if (!this.config.enabled) {
      return null;
    }

    try {
      return Sentry.startSpan(
        {
          name: name,
          op: op,
        },
        () => null,
      );
    } catch (error) {
      console.error('Failed to start transaction:', error);
      return null;
    }
  }

  /**
   * Map severity to Sentry level
   * @internal
   */
  private mapSeverityToLevel(severity?: ErrorSeverity): 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      default:
        return 'error';
    }
  }

  /**
   * Check if error tracking is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Get configuration
   */
  public getConfig(): ErrorTrackingConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const errorTracking = new ErrorTrackingService();

// Global error handler
export function setupGlobalErrorHandler() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    errorTracking.captureError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      {
        component: 'global',
        severity: ErrorSeverity.HIGH,
        tags: { type: 'unhandled_promise' },
      },
    );
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    errorTracking.captureError(event.error || new Error(event.message), {
      component: 'global',
      severity: ErrorSeverity.HIGH,
      tags: {
        type: 'global_error',
        filename: event.filename || '',
        lineno: String(event.lineno || ''),
        colno: String(event.colno || ''),
      },
    });
  });
}

// React error boundary handler
export function captureErrorBoundaryError(error: Error, errorInfo: { componentStack: string }) {
  errorTracking.captureError(error, {
    component: 'react_boundary',
    severity: ErrorSeverity.HIGH,
    tags: { type: 'react_error' },
    extra: {
      componentStack: errorInfo.componentStack,
    },
  });
}

// Export for testing
export { ErrorTrackingService };
