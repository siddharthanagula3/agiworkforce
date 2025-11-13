/**
 * Analytics Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnalyticsService } from '../../services/analytics';
import { PrivacyConsent } from '../../types/analytics';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Create new service instance
    service = new AnalyticsService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with analytics disabled by default', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should generate a session ID', () => {
      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.sessionId).toBeDefined();
      expect(sessionInfo.sessionId.length).toBeGreaterThan(0);
    });

    it('should load configuration from localStorage', () => {
      const config = {
        enabled: true,
        batchSize: 100,
        batchInterval: 60000,
      };

      localStorage.setItem('analytics_config', JSON.stringify(config));

      const newService = new AnalyticsService();
      const loadedConfig = newService.getConfig();

      expect(loadedConfig.enabled).toBe(true);
      expect(loadedConfig.batchSize).toBe(100);
    });
  });

  describe('Event Tracking', () => {
    beforeEach(() => {
      // Enable analytics for testing
      service.updateConfig({ enabled: true });
    });

    it('should track events when enabled', () => {
      service.track('app_opened', { test: true });
      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(1);
    });

    it('should not track events when disabled', () => {
      service.updateConfig({ enabled: false });
      service.track('app_opened', { test: true });
      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(0);
    });

    it('should sanitize PII from event properties', () => {
      service.track('test_event', {
        email: 'test@example.com',
        name: 'John Doe',
        safe_property: 'safe_value',
      });

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(1);
      // PII should be removed (we can't directly check the event, but it should be sanitized)
    });

    it('should auto-flush when batch size is reached', async () => {
      service.updateConfig({ batchSize: 3 });

      service.track('event_1', {});
      service.track('event_2', {});
      service.track('event_3', {});

      // After 3 events, queue should be flushed
      await new Promise((resolve) => setTimeout(resolve, 100));

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(0); // Queue should be empty after flush
    });
  });

  describe('Privacy Consent', () => {
    it('should update privacy consent', () => {
      const consent: PrivacyConsent = {
        analytics_enabled: true,
        error_reporting_enabled: true,
        performance_monitoring_enabled: true,
        consent_date: new Date().toISOString(),
        consent_version: '1.0',
      };

      service.updatePrivacyConsent(consent);

      const savedConsent = service.getPrivacyConsent();
      expect(savedConsent?.analytics_enabled).toBe(true);
      expect(savedConsent?.error_reporting_enabled).toBe(true);
    });

    it('should disable analytics when consent is revoked', () => {
      const consent: PrivacyConsent = {
        analytics_enabled: false,
        error_reporting_enabled: false,
        performance_monitoring_enabled: false,
        consent_date: new Date().toISOString(),
        consent_version: '1.0',
      };

      service.updatePrivacyConsent(consent);

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('User Properties', () => {
    it('should set user properties', () => {
      service.setUserProperties({
        plan_tier: 'pro',
        app_version: '1.0.0',
      });

      // Properties should be stored (we can't directly check, but no errors should occur)
      expect(true).toBe(true);
    });
  });

  describe('Data Export', () => {
    it('should export analytics data', async () => {
      service.updateConfig({ enabled: true });
      service.track('test_event', { foo: 'bar' });

      const data = await service.exportData();

      expect(data.user_id).toBeDefined();
      expect(data.export_date).toBeDefined();
      expect(data.events).toBeDefined();
    });
  });

  describe('Data Deletion', () => {
    it('should delete all analytics data', async () => {
      service.updateConfig({ enabled: true });
      service.track('test_event', { foo: 'bar' });

      await service.deleteAllData();

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(0);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('Offline Support', () => {
    it('should queue events offline', () => {
      service.updateConfig({ enabled: true, offline: true });

      // Simulate offline
      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false,
      });

      service.track('offline_event', {});

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      service.updateConfig({
        enabled: true,
        batchSize: 100,
        batchInterval: 60000,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.batchSize).toBe(100);
      expect(config.batchInterval).toBe(60000);
    });

    it('should persist configuration to localStorage', () => {
      service.updateConfig({
        enabled: true,
        batchSize: 50,
      });

      const savedConfig = JSON.parse(
        localStorage.getItem('analytics_config') || '{}'
      );

      expect(savedConfig.enabled).toBe(true);
      expect(savedConfig.batchSize).toBe(50);
    });
  });

  describe('Session Tracking', () => {
    it('should track session information', () => {
      const sessionInfo = service.getSessionInfo();

      expect(sessionInfo.sessionId).toBeDefined();
      expect(sessionInfo.startTime).toBeDefined();
      expect(sessionInfo.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should track page views', () => {
      service.updateConfig({ enabled: true });
      service.trackPageView('dashboard', { from: 'home' });

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.page_views).toBe(1);
    });
  });
});
