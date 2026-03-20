import { ErrorEventProperties } from '../types/analytics';
import { analytics } from './analytics';
import { safeGetJSON, safeSetJSON } from '../utils/localStorage';

import * as Sentry from '@sentry/react';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

interface ErrorTrackingConfig {
  enabled: boolean;
  dsn?: string;
  environment: 'development' | 'staging' | 'production';
  release?: string;
  sampleRate: number;
  tracesSampleRate: number;
  attachStacktrace: boolean;
  sendDefaultPii: boolean;
}

class ErrorTrackingService {
  private config: ErrorTrackingConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: false,
      environment: 'development',
      sampleRate: 1.0,
      tracesSampleRate: 0.1,
      attachStacktrace: true,
      sendDefaultPii: false,
    };

    this.loadConfig();
  }

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
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
          }

          if (event.request?.url) {
            event.request.url = event.request.url.split('?')[0];
          }

          return event;
        },
      });

      this.initialized = true;
    } catch {
      // Sentry initialization failed — tracking will remain disabled
    }
  }

  private loadConfig() {
    try {
      const savedConfig = safeGetJSON<Partial<ErrorTrackingConfig> | null>(
        'error_tracking_config',
        null,
      );
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }

      const dsn = import.meta.env['VITE_SENTRY_DSN'];
      if (dsn) {
        this.config.dsn = dsn;
      }

      const release = import.meta.env['VITE_APP_VERSION'];
      if (release) {
        this.config.release = release;
      }

      const environment = import.meta.env['MODE'];
      if (
        environment === 'development' ||
        environment === 'staging' ||
        environment === 'production'
      ) {
        this.config.environment = environment;
      }
    } catch {
      // Config load failed — defaults will be used
    }
  }

  public updateConfig(config: Partial<ErrorTrackingConfig>) {
    this.config = { ...this.config, ...config };
    safeSetJSON('error_tracking_config', this.config);

    if (config.enabled !== undefined) {
      if (config.enabled) {
        this.initialize();
      }
    }
  }

  public captureError(
    error: Error,
    context?: {
      component?: string;
      severity?: ErrorSeverity;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    },
  ) {
    if (!this.config.enabled) {
      return;
    }

    try {
      const eventProps: ErrorEventProperties = {
        error_type: error.name,
        error_message: error.message,
        error_stack: error.stack,
        component: context?.component,
        severity: context?.severity || ErrorSeverity.MEDIUM,
        recovered: false,
      };

      analytics.track('error_occurred', eventProps);

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
    } catch {
      // Sentry capture failed — error already tracked via analytics above
    }
  }

  public captureMessage(message: string, severity: ErrorSeverity = ErrorSeverity.LOW) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.captureMessage(message, {
        level: this.mapSeverityToLevel(severity),
      });
    } catch {
      // Sentry message capture failed silently
    }
  }

  public addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
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
    } catch {
      // Breadcrumb addition failed silently
    }
  }

  public setUser(userId?: string, userData?: Record<string, unknown>) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.setUser({
        id: userId,
        ...userData,
      });
    } catch {
      // User context setting failed silently
    }
  }

  public setTags(tags: Record<string, string>) {
    if (!this.config.enabled) {
      return;
    }

    try {
      Sentry.setTags(tags);
    } catch {
      // Tag setting failed silently
    }
  }

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
    } catch {
      // Feedback dialog failed silently
    }
  }

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
    } catch {
      return null;
    }
  }

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

  public isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  public getConfig(): ErrorTrackingConfig {
    return { ...this.config };
  }
}

export const errorTracking = new ErrorTrackingService();

let globalErrorHandlerInstalled = false;

export function setupGlobalErrorHandler(): (() => void) | undefined {
  if (globalErrorHandlerInstalled) {
    return;
  }
  globalErrorHandlerInstalled = true;

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const errorMessage = String(event.reason);

    // Suppress known Tauri internal errors that occur during cleanup
    if (errorMessage.includes('listeners[eventId]')) {
      event.preventDefault(); // Prevent the error dialog from showing
      return;
    }

    errorTracking.captureError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      {
        component: 'global',
        severity: ErrorSeverity.HIGH,
        tags: { type: 'unhandled_promise' },
      },
    );
  };

  const handleError = (event: ErrorEvent) => {
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
  };

  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('error', handleError);

  return () => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener('error', handleError);
    globalErrorHandlerInstalled = false;
  };
}

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

export { ErrorTrackingService };
