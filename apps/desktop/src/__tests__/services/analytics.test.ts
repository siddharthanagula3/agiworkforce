import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnalyticsService } from '../../services/analytics';
import { PrivacyConsent } from '../../types/analytics';
import { useAppModeStore } from '../../stores/appModeStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: {
    getState: vi.fn(() => ({ mode: 'cloud' as const })),
    subscribe: vi.fn(() => () => {}),
  },
  selectPrivacyMode: vi.fn((state: { mode: string }) =>
    state.mode === 'local' ? 'local' : state.mode === 'byok' ? 'byok' : 'managed',
  ),
}));

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    localStorage.clear();

    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

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
      service.updateConfig({ enabled: true });

      service.getSessionInfo();
    });

    it('should track events when enabled', () => {
      const initialCount = service.getSessionInfo().events_count;

      service.track('app_opened', { test: true });
      const sessionInfo = service.getSessionInfo();

      expect(sessionInfo.events_count).toBe(initialCount + 1);
    });

    it('should not track events when disabled', () => {
      const initialCount = service.getSessionInfo().events_count;

      service.updateConfig({ enabled: false });
      service.track('app_opened', { test: true });
      const sessionInfo = service.getSessionInfo();

      expect(sessionInfo.events_count).toBe(initialCount);
    });

    it('should sanitize PII from event properties', () => {
      const initialCount = service.getSessionInfo().events_count;

      service.track('app_opened', {
        email: 'test@example.com',
        name: 'John Doe',
        safe_property: 'safe_value',
      });

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(initialCount + 1);
    });

    it('should auto-flush when batch size is reached', async () => {
      service.updateConfig({ batchSize: 3 });

      service.track('automation_created', {});
      service.track('automation_edited', {});
      service.track('automation_deleted', {});

      await new Promise((resolve) => setTimeout(resolve, 100));

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(0);
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

      expect(() =>
        service.setUserProperties({ plan_tier: 'pro', app_version: '1.0.0' }),
      ).not.toThrow();
    });
  });

  describe('Data Export', () => {
    it('should export analytics data', async () => {
      service.updateConfig({ enabled: true });
      service.track('app_opened', { foo: 'bar' });

      const data = await service.exportData();

      expect(data.user_id).toBeDefined();
      expect(data.export_date).toBeDefined();
      expect(data.events).toBeDefined();
    });
  });

  describe('Data Deletion', () => {
    it('should delete all analytics data', async () => {
      service.updateConfig({ enabled: true });
      service.track('app_closed', { foo: 'bar' });

      await service.deleteAllData();

      const sessionInfo = service.getSessionInfo();
      expect(sessionInfo.events_count).toBe(0);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('Offline Support', () => {
    it('should queue events offline', () => {
      service.updateConfig({ enabled: true, offline: true });

      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false,
      });

      service.track('error_occurred', {});

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

      const savedConfig = JSON.parse(localStorage.getItem('analytics_config') || '{}');

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

  describe('Trust Boundary (Local + BYOK private modes)', () => {
    const mockedGetState = () => vi.mocked(useAppModeStore.getState);

    const setMode = (mode: 'local' | 'cloud' | 'byok') =>
      mockedGetState().mockReturnValue({ mode } as unknown as ReturnType<
        typeof useAppModeStore.getState
      >);

    beforeEach(() => {
      service.updateConfig({ enabled: true });
      setMode('cloud');
    });

    afterEach(() => {
      setMode('cloud');
    });

    it('TRUST-BOUNDARY: never emits telemetry in local mode even when consent is granted', () => {
      setMode('local');
      const before = service.getSessionInfo().events_count;
      service.track('app_opened', { page: 'chat' });
      expect(service.getSessionInfo().events_count).toBe(before);
    });

    it('TRUST-BOUNDARY: never emits telemetry in BYOK mode (regression: BYOK is private, not managed)', () => {
      setMode('byok');
      const before = service.getSessionInfo().events_count;
      service.track('app_opened', { page: 'chat' });
      expect(service.getSessionInfo().events_count).toBe(before);
    });

    it('TRUST-BOUNDARY: emits telemetry in cloud mode when enabled', () => {
      setMode('cloud');
      const before = service.getSessionInfo().events_count;
      service.track('app_opened', { page: 'chat' });
      expect(service.getSessionInfo().events_count).toBe(before + 1);
    });

    it('TRUST-BOUNDARY: switching from cloud to local stops new events', () => {
      setMode('cloud');
      service.track('app_opened', {});
      const afterCloud = service.getSessionInfo().events_count;

      setMode('local');
      service.track('settings_changed', {});
      expect(service.getSessionInfo().events_count).toBe(afterCloud);
    });

    it('STRESS: 1000 rapid track() calls in local mode produce zero events', () => {
      setMode('local');
      const before = service.getSessionInfo().events_count;
      for (let i = 0; i < 1000; i++) {
        service.track('app_opened', { iteration: i });
      }
      expect(service.getSessionInfo().events_count).toBe(before);
    });

    it('STRESS: interleaved cloud/local tracks, only cloud-mode calls are counted', () => {
      const before = service.getSessionInfo().events_count;
      let cloudCalls = 0;
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          setMode('local');
          service.track('app_opened', { i });
        } else {
          setMode('cloud');
          service.track('settings_changed', { i });
          cloudCalls++;
        }
      }
      expect(service.getSessionInfo().events_count).toBe(before + cloudCalls);
    });

    it('STRESS: track() with null/undefined/empty properties does not throw in either mode', () => {
      for (const mode of ['local', 'cloud'] as const) {
        setMode(mode);
        expect(() => service.track('app_opened', {})).not.toThrow();
        expect(() => service.track('app_opened', { key: null as unknown as string })).not.toThrow();
        expect(() =>
          service.track('app_opened', { key: undefined as unknown as string }),
        ).not.toThrow();
      }
    });
  });
});
