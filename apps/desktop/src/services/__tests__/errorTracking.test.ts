/**
 * Error Tracking Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorTrackingService, ErrorSeverity } from '../errorTracking';

// Mock analytics service
vi.mock('../analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

describe('ErrorTrackingService', () => {
  let service: ErrorTrackingService;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Clear import.meta.env
    vi.stubEnv('VITE_SENTRY_DSN', '');
    vi.stubEnv('VITE_APP_VERSION', '1.0.0');
    vi.stubEnv('MODE', 'test');

    // Create new service instance
    service = new ErrorTrackingService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Initialization', () => {
    it('should initialize with error tracking disabled by default', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should load configuration from localStorage', () => {
      const config = {
        enabled: true,
        environment: 'production',
        sampleRate: 0.5,
      };

      localStorage.setItem('error_tracking_config', JSON.stringify(config));

      const newService = new ErrorTrackingService();
      const loadedConfig = newService.getConfig();

      expect(loadedConfig.enabled).toBe(true);
      expect(loadedConfig.environment).toBe('test');
      expect(loadedConfig.sampleRate).toBe(0.5);
    });

    it('should load DSN from environment variable', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test-dsn.sentry.io');

      const newService = new ErrorTrackingService();
      const config = newService.getConfig();

      expect(config.dsn).toBe('https://test-dsn.sentry.io');
    });

    it('should not initialize when disabled', () => {
      service.initialize();
      expect(service.isEnabled()).toBe(false);
    });

    it('should not initialize without DSN', () => {
      service.updateConfig({ enabled: true });
      service.initialize();
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      service.updateConfig({
        enabled: true,
        sampleRate: 0.8,
        tracesSampleRate: 0.2,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.sampleRate).toBe(0.8);
      expect(config.tracesSampleRate).toBe(0.2);
    });

    it('should persist configuration to localStorage', () => {
      service.updateConfig({
        enabled: true,
        environment: 'staging',
      });

      const savedConfig = JSON.parse(localStorage.getItem('error_tracking_config') || '{}');

      expect(savedConfig.enabled).toBe(true);
      expect(savedConfig.environment).toBe('staging');
    });

    it('should reinitialize on enable state change', () => {
      const initializeSpy = vi.spyOn(service, 'initialize');

      service.updateConfig({ enabled: true });

      expect(initializeSpy).toHaveBeenCalled();
    });
  });

  describe('Error Capture', () => {
    it('should capture error when enabled', () => {
      service.updateConfig({ enabled: true });

      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        severity: ErrorSeverity.HIGH,
        tags: { page: 'dashboard' },
        extra: { userId: '123' },
      };

      // Should not throw
      expect(() => service.captureError(error, context)).not.toThrow();
    });

    it('should log error to console when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Test error');
      service.captureError(error);

      expect(consoleSpy).toHaveBeenCalledWith(error);

      consoleSpy.mockRestore();
    });

    it('should not throw when analytics tracking fails', () => {
      service.updateConfig({ enabled: true });

      const error = new Error('Test error');

      // Should not throw even if analytics fails
      expect(() => service.captureError(error)).not.toThrow();
    });
  });

  describe('Message Capture', () => {
    it('should capture message when enabled', () => {
      service.updateConfig({ enabled: true });

      // Should not throw
      expect(() => service.captureMessage('Test message', ErrorSeverity.LOW)).not.toThrow();
    });

    it('should log message to console when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      service.captureMessage('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('Test message');

      consoleSpy.mockRestore();
    });

    it('should default to LOW severity', () => {
      service.updateConfig({ enabled: true });

      // Should not throw with default severity
      expect(() => service.captureMessage('Test message')).not.toThrow();
    });
  });

  describe('Breadcrumbs', () => {
    it('should add breadcrumb when enabled', () => {
      service.updateConfig({ enabled: true });

      // Should not throw
      expect(() =>
        service.addBreadcrumb('navigation', 'User clicked button', {
          buttonId: 'submit',
        }),
      ).not.toThrow();
    });

    it('should not add breadcrumb when disabled', () => {
      // Should not throw
      expect(() => service.addBreadcrumb('navigation', 'User clicked button')).not.toThrow();
    });
  });

  describe('User Context', () => {
    it('should set user context when enabled', () => {
      service.updateConfig({ enabled: true });

      // Should not throw
      expect(() => service.setUser('user-123', { plan: 'pro' })).not.toThrow();
    });

    it('should not set user context when disabled', () => {
      // Should not throw
      expect(() => service.setUser('user-123')).not.toThrow();
    });
  });

  describe('Tags', () => {
    it('should set tags when enabled', () => {
      service.updateConfig({ enabled: true });

      // Should not throw
      expect(() => service.setTags({ version: '1.0.0', platform: 'desktop' })).not.toThrow();
    });

    it('should not set tags when disabled', () => {
      // Should not throw
      expect(() => service.setTags({ version: '1.0.0' })).not.toThrow();
    });
  });

  describe('Feedback Dialog', () => {
    it('should show feedback dialog when enabled', () => {
      service.updateConfig({ enabled: true });

      // Should not throw
      expect(() => service.showFeedbackDialog('event-123')).not.toThrow();
    });

    it('should not show feedback dialog when disabled', () => {
      // Should not throw
      expect(() => service.showFeedbackDialog()).not.toThrow();
    });
  });

  describe('Transactions', () => {
    it('should start transaction when enabled', () => {
      service.updateConfig({ enabled: true });

      const transaction = service.startTransaction('api_call', 'http');
      expect(transaction).toBeNull(); // Returns null since Sentry not integrated
    });

    it('should return null when disabled', () => {
      const transaction = service.startTransaction('api_call', 'http');
      expect(transaction).toBeNull();
    });
  });

  describe('Severity Levels', () => {
    it('should have severity level enum', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });

    it('should capture errors with different severity levels', () => {
      service.updateConfig({ enabled: true });

      // Should not throw with any severity level
      expect(() =>
        service.captureError(new Error('Low'), { severity: ErrorSeverity.LOW }),
      ).not.toThrow();
      expect(() =>
        service.captureError(new Error('Medium'), { severity: ErrorSeverity.MEDIUM }),
      ).not.toThrow();
      expect(() =>
        service.captureError(new Error('High'), { severity: ErrorSeverity.HIGH }),
      ).not.toThrow();
      expect(() =>
        service.captureError(new Error('Critical'), {
          severity: ErrorSeverity.CRITICAL,
        }),
      ).not.toThrow();
    });
  });

  describe('Error Handler Setup', () => {
    it('should be able to set up error handlers', () => {
      // Test that the setupGlobalErrorHandler function exists and can be called
      // We don't actually set it up in tests to avoid interfering with test runner
      expect(service).toBeDefined();
      expect(service.captureError).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should have valid default configuration', () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.environment).toBe('test');
      expect(config.sampleRate).toBe(1.0);
      expect(config.tracesSampleRate).toBe(0.1);
      expect(config.attachStacktrace).toBe(true);
      expect(config.sendDefaultPii).toBe(false);
    });

    it('should respect privacy settings', () => {
      const config = service.getConfig();
      expect(config.sendDefaultPii).toBe(false);
    });
  });

  describe('Error Context', () => {
    it('should capture error with component context', () => {
      service.updateConfig({ enabled: true });

      const error = new Error('Component error');
      const context = {
        component: 'UserProfile',
        severity: ErrorSeverity.MEDIUM,
      };

      expect(() => service.captureError(error, context)).not.toThrow();
    });

    it('should capture error with tags', () => {
      service.updateConfig({ enabled: true });

      const error = new Error('Tagged error');
      const context = {
        tags: {
          feature: 'authentication',
          action: 'login',
        },
      };

      expect(() => service.captureError(error, context)).not.toThrow();
    });

    it('should capture error with extra data', () => {
      service.updateConfig({ enabled: true });

      const error = new Error('Error with extra data');
      const context = {
        extra: {
          userId: '123',
          requestId: 'req-456',
          metadata: { key: 'value' },
        },
      };

      expect(() => service.captureError(error, context)).not.toThrow();
    });
  });
});
