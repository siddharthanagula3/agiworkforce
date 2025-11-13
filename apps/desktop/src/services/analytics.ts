/**
 * Analytics Service
 *
 * Privacy-first analytics with event batching, offline queue, and opt-in tracking
 */

import { invoke } from '@tauri-apps/api/core';
import {
  AnalyticsEvent,
  EventName,
  EventBatch,
  AnalyticsConfig,
  UserProperties,
  SessionInfo,
  PrivacyConsent,
} from '../types/analytics';
import { v4 as uuidv4 } from 'uuid'; // You'll need to add this: pnpm add uuid

class AnalyticsService {
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private sessionId: string;
  private userId?: string;
  private sessionStartTime: number;
  private userProperties: UserProperties = {};
  private flushTimer?: number;
  private isOnline: boolean = true;
  private privacyConsent?: PrivacyConsent;

  constructor() {
    this.sessionId = uuidv4();
    this.sessionStartTime = Date.now();

    // Default configuration
    this.config = {
      enabled: false, // Opt-in by default
      allowErrorReporting: false,
      allowPerformanceMonitoring: false,
      allowUsageTracking: false,
      batchSize: 50,
      batchInterval: 30000, // 30 seconds
      offline: true,
    };

    this.initializeService();
  }

  private async initializeService() {
    try {
      // Load configuration from settings
      await this.loadConfig();

      // Load privacy consent
      await this.loadPrivacyConsent();

      // Get or create user ID (anonymous)
      await this.loadUserId();

      // Load session ID from backend
      const backendSessionId = await invoke<string>('analytics_get_session_id');
      if (backendSessionId) {
        this.sessionId = backendSessionId;
      }

      // Set up online/offline listeners
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flushQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
      });

      // Set up periodic flush
      this.startFlushTimer();

      // Track session start
      if (this.config.enabled) {
        this.track('session_started', {
          app_version: this.userProperties.app_version,
          os: this.userProperties.os_version,
        });
      }

      // Set up beforeunload to flush events
      window.addEventListener('beforeunload', () => {
        this.endSession();
      });
    } catch (error) {
      console.error('Failed to initialize analytics:', error);
    }
  }

  private async loadConfig() {
    try {
      const savedConfig = localStorage.getItem('analytics_config');
      if (savedConfig) {
        this.config = { ...this.config, ...JSON.parse(savedConfig) };
      }
    } catch (error) {
      console.error('Failed to load analytics config:', error);
    }
  }

  private async loadPrivacyConsent() {
    try {
      const savedConsent = localStorage.getItem('privacy_consent');
      if (savedConsent) {
        this.privacyConsent = JSON.parse(savedConsent);
        this.config.enabled = this.privacyConsent.analytics_enabled;
        this.config.allowErrorReporting =
          this.privacyConsent.error_reporting_enabled;
        this.config.allowPerformanceMonitoring =
          this.privacyConsent.performance_monitoring_enabled;
      }
    } catch (error) {
      console.error('Failed to load privacy consent:', error);
    }
  }

  private async loadUserId() {
    try {
      let userId = localStorage.getItem('analytics_user_id');
      if (!userId) {
        userId = uuidv4();
        localStorage.setItem('analytics_user_id', userId);
      }
      this.userId = userId;
    } catch (error) {
      console.error('Failed to load user ID:', error);
    }
  }

  /**
   * Track an analytics event
   */
  public track(eventName: EventName, properties: Record<string, any> = {}) {
    if (!this.config.enabled) {
      return;
    }

    // Filter out PII if accidentally included
    const sanitizedProperties = this.sanitizeProperties(properties);

    const event: AnalyticsEvent = {
      name: eventName,
      properties: sanitizedProperties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    // Add to queue
    this.eventQueue.push(event);

    // Send to backend for persistence
    this.sendEventToBackend(event);

    // Check if we need to flush
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flushQueue();
    }
  }

  /**
   * Track a page view
   */
  public trackPageView(pageName: string, properties: Record<string, any> = {}) {
    this.track('session_started', {
      page_name: pageName,
      ...properties,
    });
  }

  /**
   * Set user properties (non-PII only)
   */
  public setUserProperties(properties: Partial<UserProperties>) {
    this.userProperties = { ...this.userProperties, ...properties };

    if (this.config.enabled) {
      // Send to backend
      Object.entries(properties).forEach(([key, value]) => {
        invoke('analytics_set_user_property', { key, value }).catch((error) =>
          console.error('Failed to set user property:', error)
        );
      });
    }
  }

  /**
   * Get current session info
   */
  public getSessionInfo(): SessionInfo {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      startTime: this.sessionStartTime,
      duration_ms: Date.now() - this.sessionStartTime,
      page_views: this.eventQueue.filter((e) => e.name === 'session_started')
        .length,
      events_count: this.eventQueue.length,
      app_version: this.userProperties.app_version,
      os: this.userProperties.os_version,
    };
  }

  /**
   * Update analytics configuration
   */
  public updateConfig(config: Partial<AnalyticsConfig>) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('analytics_config', JSON.stringify(this.config));

    // Restart flush timer if interval changed
    if (config.batchInterval) {
      this.stopFlushTimer();
      this.startFlushTimer();
    }
  }

  /**
   * Update privacy consent
   */
  public updatePrivacyConsent(consent: PrivacyConsent) {
    this.privacyConsent = consent;
    localStorage.setItem('privacy_consent', JSON.stringify(consent));

    this.config.enabled = consent.analytics_enabled;
    this.config.allowErrorReporting = consent.error_reporting_enabled;
    this.config.allowPerformanceMonitoring =
      consent.performance_monitoring_enabled;

    localStorage.setItem('analytics_config', JSON.stringify(this.config));
  }

  /**
   * Export all analytics data (GDPR/CCPA compliance)
   */
  public async exportData() {
    const data = {
      user_id: this.userId,
      export_date: new Date().toISOString(),
      session_info: this.getSessionInfo(),
      events: this.eventQueue,
      user_properties: this.userProperties,
    };

    // Create download
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return data;
  }

  /**
   * Delete all analytics data (GDPR/CCPA compliance)
   */
  public async deleteAllData() {
    // Clear local storage
    localStorage.removeItem('analytics_user_id');
    localStorage.removeItem('analytics_config');
    localStorage.removeItem('privacy_consent');

    // Clear queue
    this.eventQueue = [];

    // Delete backend data
    try {
      await invoke('analytics_delete_all_data');
    } catch (error) {
      console.error('Failed to delete backend analytics data:', error);
    }

    // Reset state
    this.userId = undefined;
    this.config.enabled = false;
  }

  /**
   * Flush event queue
   */
  public async flushQueue() {
    if (this.eventQueue.length === 0) {
      return;
    }

    if (!this.isOnline && this.config.offline) {
      // Save to local storage for later
      this.saveOfflineEvents();
      return;
    }

    const batch: EventBatch = {
      events: [...this.eventQueue],
      batchId: uuidv4(),
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId,
    };

    try {
      // Send to backend
      await invoke('analytics_flush_events');

      // Clear queue
      this.eventQueue = [];

      // Remove offline events
      localStorage.removeItem('analytics_offline_events');
    } catch (error) {
      console.error('Failed to flush analytics events:', error);

      if (this.config.offline) {
        this.saveOfflineEvents();
      }
    }
  }

  /**
   * End current session
   */
  private async endSession() {
    if (this.config.enabled) {
      this.track('session_ended', {
        duration_ms: Date.now() - this.sessionStartTime,
        events_count: this.eventQueue.length,
      });
    }

    // Force flush
    await this.flushQueue();
  }

  /**
   * Save events to local storage for offline support
   */
  private saveOfflineEvents() {
    try {
      const existingEvents = localStorage.getItem('analytics_offline_events');
      const events = existingEvents ? JSON.parse(existingEvents) : [];
      const allEvents = [...events, ...this.eventQueue];

      // Limit to 1000 events to prevent storage issues
      const limitedEvents = allEvents.slice(-1000);

      localStorage.setItem(
        'analytics_offline_events',
        JSON.stringify(limitedEvents)
      );
    } catch (error) {
      console.error('Failed to save offline events:', error);
    }
  }

  /**
   * Load and process offline events
   */
  private async loadOfflineEvents() {
    try {
      const offlineEvents = localStorage.getItem('analytics_offline_events');
      if (offlineEvents) {
        const events: AnalyticsEvent[] = JSON.parse(offlineEvents);
        this.eventQueue.push(...events);
        await this.flushQueue();
      }
    } catch (error) {
      console.error('Failed to load offline events:', error);
    }
  }

  /**
   * Send individual event to backend
   */
  private async sendEventToBackend(event: AnalyticsEvent) {
    try {
      await invoke('analytics_track_event', { event });
    } catch (error) {
      console.error('Failed to send event to backend:', error);
    }
  }

  /**
   * Sanitize properties to remove PII
   */
  private sanitizeProperties(properties: Record<string, any>) {
    const sanitized = { ...properties };

    // List of keys that might contain PII
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

    // Remove PII keys
    piiKeys.forEach((key) => {
      if (key in sanitized) {
        delete sanitized[key];
      }
    });

    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach((key) => {
      if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null &&
        !Array.isArray(sanitized[key])
      ) {
        sanitized[key] = this.sanitizeProperties(sanitized[key]);
      }
    });

    return sanitized;
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = window.setInterval(() => {
      this.flushQueue();
    }, this.config.batchInterval);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  /**
   * Get privacy consent
   */
  public getPrivacyConsent(): PrivacyConsent | undefined {
    return this.privacyConsent;
  }

  /**
   * Check if analytics is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }
}

// Singleton instance
export const analytics = new AnalyticsService();

// Export for testing
export { AnalyticsService };
