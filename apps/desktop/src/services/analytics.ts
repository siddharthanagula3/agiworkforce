import { v4 as uuidv4 } from 'uuid';
import {
  analyticsTrackEvent,
  analyticsFlushEvents,
  analyticsGetSessionId,
  analyticsSetUserProperty,
  analyticsDeleteAllData,
} from '../api/analytics';
import {
  AnalyticsConfig,
  AnalyticsEvent,
  EventName,
  PrivacyConsent,
  SessionInfo,
  UserProperties,
} from '../types/analytics';
import {
  safeGetItem,
  safeGetJSON,
  safeRemoveItem,
  safeSetItem,
  safeSetJSON,
} from '../utils/localStorage';

class AnalyticsService {
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private sessionId: string;
  private userId?: string;
  private sessionStartTime: number;
  private userProperties: UserProperties = {};
  private flushTimer?: ReturnType<typeof setInterval>;
  private isOnline: boolean = true;
  private privacyConsent?: PrivacyConsent;
  private initialized: boolean = false;

  constructor() {
    this.sessionId = uuidv4();
    this.sessionStartTime = Date.now();

    this.config = {
      enabled: false,
      allowErrorReporting: false,
      allowPerformanceMonitoring: false,
      allowUsageTracking: false,
      batchSize: 50,
      batchInterval: 30000,
      offline: true,
    };

    this.initializeService();
  }

  /**
   * Cleanup all event listeners and timers.
   * Call this when the analytics service is no longer needed.
   */
  public cleanup(): void {
    this.stopFlushTimer();
    window.removeEventListener('online', this._handleOnline);
    window.removeEventListener('offline', this._handleOffline);
    window.removeEventListener('beforeunload', this._handleBeforeUnload);
  }

  private _handleOnline = () => {
    this.isOnline = true;
    this.flushQueue();
  };

  private _handleOffline = () => {
    this.isOnline = false;
  };

  private _handleBeforeUnload = () => {
    this.endSession();
  };

  private async initializeService() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      await this.loadConfig();

      await this.loadPrivacyConsent();

      await this.loadUserId();

      const backendSessionId = await analyticsGetSessionId();
      if (backendSessionId) {
        this.sessionId = backendSessionId;
      }

      window.addEventListener('online', this._handleOnline);

      window.addEventListener('offline', this._handleOffline);

      this.startFlushTimer();

      if (this.config.enabled) {
        this.track('session_started', {
          app_version: this.userProperties.app_version,
          os: this.userProperties.os_version,
        });
      }

      window.addEventListener('beforeunload', this._handleBeforeUnload);
    } catch (error) {
      console.error('Failed to initialize analytics:', error);
    }
  }

  private async loadConfig() {
    const savedConfig = safeGetJSON<Partial<AnalyticsConfig>>('analytics_config', {});
    this.config = { ...this.config, ...savedConfig };
  }

  private async loadPrivacyConsent() {
    const savedConsent = safeGetJSON<PrivacyConsent | null>('privacy_consent', null);
    if (savedConsent) {
      this.privacyConsent = savedConsent;
      this.config.enabled = this.privacyConsent?.analytics_enabled ?? false;
      this.config.allowErrorReporting = this.privacyConsent?.error_reporting_enabled ?? false;
      this.config.allowPerformanceMonitoring =
        this.privacyConsent?.performance_monitoring_enabled ?? false;
    }
  }

  private async loadUserId() {
    let userId = safeGetItem('analytics_user_id');
    if (!userId) {
      userId = uuidv4();
      safeSetItem('analytics_user_id', userId);
    }
    this.userId = userId;
  }

  public track(eventName: EventName, properties: Record<string, unknown> = {}) {
    if (!this.config.enabled) {
      return;
    }

    const sanitizedProperties = this.sanitizeProperties(properties);

    const event: AnalyticsEvent = {
      name: eventName,
      properties: sanitizedProperties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    this.eventQueue.push(event);

    this.sendEventToBackend(event);

    if (this.eventQueue.length >= this.config.batchSize) {
      this.flushQueue();
    }
  }

  public trackPageView(pageName: string, properties: Record<string, unknown> = {}) {
    this.track('session_started', {
      page_name: pageName,
      ...properties,
    });
  }

  public setUserProperties(properties: Partial<UserProperties>) {
    this.userProperties = { ...this.userProperties, ...properties };

    if (this.config.enabled) {
      Object.entries(properties).forEach(([key, value]) => {
        analyticsSetUserProperty(key, value).catch((error) =>
          console.error('Failed to set user property:', error),
        );
      });
    }
  }

  public getSessionInfo(): SessionInfo {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      startTime: this.sessionStartTime,
      duration_ms: Date.now() - this.sessionStartTime,
      page_views: this.eventQueue.filter((e) => e.name === 'session_started').length,
      events_count: this.eventQueue.length,
      app_version: this.userProperties.app_version,
      os: this.userProperties.os_version,
    };
  }

  public updateConfig(config: Partial<AnalyticsConfig>) {
    this.config = { ...this.config, ...config };
    const success = safeSetJSON('analytics_config', this.config);
    if (!success) {
      console.warn('[Analytics] Failed to persist config - changes may not survive reload');
    }

    if (config.batchInterval) {
      this.stopFlushTimer();
      this.startFlushTimer();
    }
  }

  public updatePrivacyConsent(consent: PrivacyConsent) {
    this.privacyConsent = consent;
    safeSetJSON('privacy_consent', consent);

    this.config.enabled = consent.analytics_enabled;
    this.config.allowErrorReporting = consent.error_reporting_enabled;
    this.config.allowPerformanceMonitoring = consent.performance_monitoring_enabled;

    safeSetJSON('analytics_config', this.config);
  }

  public async exportData() {
    const data = {
      user_id: this.userId,
      export_date: new Date().toISOString(),
      session_info: this.getSessionInfo(),
      events: this.eventQueue,
      user_properties: this.userProperties,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-export-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return data;
  }

  public async deleteAllData() {
    safeRemoveItem('analytics_user_id');
    safeRemoveItem('analytics_config');
    safeRemoveItem('privacy_consent');

    this.eventQueue = [];

    try {
      await analyticsDeleteAllData();
    } catch (error) {
      console.error('Failed to delete backend analytics data:', error);
    }

    this.userId = undefined;
    this.config.enabled = false;
  }

  public async flushQueue() {
    if (this.eventQueue.length === 0) {
      return;
    }

    if (!this.isOnline && this.config.offline) {
      this.saveOfflineEvents();
      return;
    }

    try {
      await analyticsFlushEvents();

      this.eventQueue = [];

      safeRemoveItem('analytics_offline_events');
    } catch (error) {
      console.error('Failed to flush analytics events:', error);

      if (this.config.offline) {
        this.saveOfflineEvents();
      }
    }
  }

  private async endSession() {
    if (this.config.enabled) {
      this.track('session_ended', {
        duration_ms: Date.now() - this.sessionStartTime,
        events_count: this.eventQueue.length,
      });
    }

    await this.flushQueue();
  }

  private saveOfflineEvents() {
    const existingEvents = safeGetJSON<AnalyticsEvent[]>('analytics_offline_events', []);
    const allEvents = [...existingEvents, ...this.eventQueue];

    const limitedEvents = allEvents.slice(-1000);

    const success = safeSetJSON('analytics_offline_events', limitedEvents);
    if (!success) {
      console.warn('[Analytics] Failed to save offline events - will retry when online');
    }
  }

  private async sendEventToBackend(event: AnalyticsEvent) {
    try {
      await analyticsTrackEvent({
        name: event.name,
        properties: event.properties as Record<string, unknown>,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        userId: event.userId,
      });
    } catch (error) {
      console.error('Failed to send event to backend:', error);
    }
  }

  private sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...properties };

    const piiKeys = [
      'email',
      'name',
      'username',
      'phone',
      'address',
      'ip',
      'ssn',
      'credit_card',
      'password',
      'token',
      'api_key',
    ];

    piiKeys.forEach((key) => {
      if (key in sanitized) {
        delete sanitized[key];
      }
    });

    Object.keys(sanitized).forEach((key) => {
      if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null &&
        !Array.isArray(sanitized[key])
      ) {
        sanitized[key] = this.sanitizeProperties(sanitized[key] as Record<string, unknown>);
      }
    });

    return sanitized;
  }

  private startFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = window.setInterval(() => {
      void this.flushQueue().catch((error) => {
        console.error('Failed to flush analytics queue:', error);
      });
    }, this.config.batchInterval) as unknown as ReturnType<typeof setInterval>;
  }

  private stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  public getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  public getPrivacyConsent(): PrivacyConsent | undefined {
    return this.privacyConsent;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }
}

export const analytics = new AnalyticsService();

export { AnalyticsService };
