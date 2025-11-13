/**
 * Feature Flags Service
 *
 * Remote feature toggles, A/B testing, and gradual rollout
 * Can integrate with LaunchDarkly or similar services
 */

import { invoke } from '@tauri-apps/api/core';
import { analytics } from './analytics';
import { FeatureFlag, FeatureFlagConfig, UserProperties } from '../types/analytics';

/**
 * Feature flag names
 */
export enum FeatureFlagName {
  // AGI Features
  PARALLEL_EXECUTION = 'parallel_execution',
  AUTONOMOUS_AGENT = 'autonomous_agent',
  VISION_AUTOMATION = 'vision_automation',

  // UI Features
  NEW_DASHBOARD = 'new_dashboard',
  DARK_MODE = 'dark_mode',
  COMMAND_PALETTE = 'command_palette',

  // Automation Features
  BROWSER_AUTOMATION = 'browser_automation',
  DATABASE_INTEGRATION = 'database_integration',
  API_AUTOMATION = 'api_automation',

  // Chat Features
  STREAMING_RESPONSES = 'streaming_responses',
  CODE_COMPLETION = 'code_completion',
  FUNCTION_CALLING = 'function_calling',

  // Performance Features
  RESPONSE_CACHING = 'response_caching',
  PREFETCHING = 'prefetching',

  // Beta Features
  MOBILE_APP = 'mobile_app',
  BROWSER_EXTENSION = 'browser_extension',
  MARKETPLACE = 'marketplace',
}

class FeatureFlagsService {
  private config: FeatureFlagConfig;
  private userProperties: UserProperties = {};
  private localOverrides: Map<string, boolean> = new Map();
  private updateInterval?: number;

  constructor() {
    this.config = {
      flags: this.getDefaultFlags(),
      environment: 'development',
      lastUpdated: Date.now(),
    };

    this.initializeService();
  }

  /**
   * Initialize the service
   */
  private async initializeService() {
    try {
      // Load config from storage
      await this.loadConfig();

      // Load local overrides (for development)
      this.loadLocalOverrides();

      // Load user properties
      this.loadUserProperties();

      // Fetch remote flags
      await this.fetchRemoteFlags();

      // Set up periodic updates (every 5 minutes)
      this.startPeriodicUpdates();
    } catch (error) {
      console.error('Failed to initialize feature flags:', error);
    }
  }

  /**
   * Get default feature flags
   */
  private getDefaultFlags(): Record<string, FeatureFlag> {
    return {
      [FeatureFlagName.PARALLEL_EXECUTION]: {
        name: FeatureFlagName.PARALLEL_EXECUTION,
        enabled: true,
        enabledForAll: true,
        description: 'Enable parallel agent execution (Cursor 2.0-style)',
      },
      [FeatureFlagName.AUTONOMOUS_AGENT]: {
        name: FeatureFlagName.AUTONOMOUS_AGENT,
        enabled: true,
        enabledForAll: true,
        description: '24/7 autonomous agent for background tasks',
      },
      [FeatureFlagName.VISION_AUTOMATION]: {
        name: FeatureFlagName.VISION_AUTOMATION,
        enabled: true,
        rolloutPercentage: 50,
        description: 'Vision-based automation with OCR',
      },
      [FeatureFlagName.NEW_DASHBOARD]: {
        name: FeatureFlagName.NEW_DASHBOARD,
        enabled: false,
        rolloutPercentage: 10,
        description: 'New redesigned dashboard',
      },
      [FeatureFlagName.DARK_MODE]: {
        name: FeatureFlagName.DARK_MODE,
        enabled: true,
        enabledForAll: true,
        description: 'Dark mode theme',
      },
      [FeatureFlagName.COMMAND_PALETTE]: {
        name: FeatureFlagName.COMMAND_PALETTE,
        enabled: true,
        enabledForAll: true,
        description: 'Command palette (Cmd/Ctrl+K)',
      },
      [FeatureFlagName.BROWSER_AUTOMATION]: {
        name: FeatureFlagName.BROWSER_AUTOMATION,
        enabled: true,
        enabledForAll: true,
        description: 'Browser automation with Playwright',
      },
      [FeatureFlagName.DATABASE_INTEGRATION]: {
        name: FeatureFlagName.DATABASE_INTEGRATION,
        enabled: true,
        targetPlanTiers: ['pro', 'enterprise'],
        description: 'Database integration (SQL/NoSQL)',
      },
      [FeatureFlagName.API_AUTOMATION]: {
        name: FeatureFlagName.API_AUTOMATION,
        enabled: true,
        enabledForAll: true,
        description: 'API automation and webhooks',
      },
      [FeatureFlagName.STREAMING_RESPONSES]: {
        name: FeatureFlagName.STREAMING_RESPONSES,
        enabled: true,
        enabledForAll: true,
        description: 'Real-time streaming chat responses',
      },
      [FeatureFlagName.CODE_COMPLETION]: {
        name: FeatureFlagName.CODE_COMPLETION,
        enabled: false,
        rolloutPercentage: 20,
        description: 'AI code completion in editor',
      },
      [FeatureFlagName.FUNCTION_CALLING]: {
        name: FeatureFlagName.FUNCTION_CALLING,
        enabled: true,
        enabledForAll: true,
        description: 'Function calling for tool use',
      },
      [FeatureFlagName.RESPONSE_CACHING]: {
        name: FeatureFlagName.RESPONSE_CACHING,
        enabled: true,
        enabledForAll: true,
        description: '3-tier response caching system',
      },
      [FeatureFlagName.PREFETCHING]: {
        name: FeatureFlagName.PREFETCHING,
        enabled: false,
        rolloutPercentage: 30,
        description: 'Prefetch common responses',
      },
      [FeatureFlagName.MOBILE_APP]: {
        name: FeatureFlagName.MOBILE_APP,
        enabled: false,
        targetPlanTiers: ['pro', 'enterprise'],
        description: 'Mobile companion app',
      },
      [FeatureFlagName.BROWSER_EXTENSION]: {
        name: FeatureFlagName.BROWSER_EXTENSION,
        enabled: false,
        rolloutPercentage: 10,
        description: 'Browser extension for web automation',
      },
      [FeatureFlagName.MARKETPLACE]: {
        name: FeatureFlagName.MARKETPLACE,
        enabled: false,
        targetPlanTiers: ['enterprise'],
        description: 'Extension marketplace',
      },
    };
  }

  /**
   * Check if a feature is enabled
   */
  public isEnabled(flagName: string | FeatureFlagName): boolean {
    // Check local override first (for development)
    if (this.localOverrides.has(flagName)) {
      return this.localOverrides.get(flagName) || false;
    }

    const flag = this.config.flags[flagName];
    if (!flag || !flag.enabled) {
      return false;
    }

    // Check if enabled for all users
    if (flag.enabledForAll) {
      return true;
    }

    // Check user ID targeting
    if (flag.targetUserIds && this.userProperties.userId) {
      if (flag.targetUserIds.includes(this.userProperties.userId)) {
        return true;
      }
    }

    // Check plan tier targeting
    if (flag.targetPlanTiers && this.userProperties.plan_tier) {
      if (flag.targetPlanTiers.includes(this.userProperties.plan_tier)) {
        return true;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined) {
      return this.isInRollout(flagName, flag.rolloutPercentage);
    }

    return false;
  }

  /**
   * Check if user is in rollout percentage
   */
  private isInRollout(flagName: string, percentage: number): boolean {
    if (!this.userProperties.userId) {
      return false;
    }

    // Use consistent hashing to determine if user is in rollout
    const hash = this.hashString(
      `${flagName}-${this.userProperties.userId}`
    );
    const bucket = hash % 100;
    return bucket < percentage;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get all enabled features
   */
  public getEnabledFeatures(): string[] {
    return Object.keys(this.config.flags).filter((flag) =>
      this.isEnabled(flag)
    );
  }

  /**
   * Get feature flag details
   */
  public getFlag(flagName: string): FeatureFlag | undefined {
    return this.config.flags[flagName];
  }

  /**
   * Get all flags
   */
  public getAllFlags(): Record<string, FeatureFlag> {
    return { ...this.config.flags };
  }

  /**
   * Set user properties for targeting
   */
  public setUserProperties(properties: Partial<UserProperties>) {
    this.userProperties = { ...this.userProperties, ...properties };
    localStorage.setItem(
      'feature_flags_user_properties',
      JSON.stringify(this.userProperties)
    );
  }

  /**
   * Set local override (for development)
   */
  public setLocalOverride(flagName: string, enabled: boolean) {
    this.localOverrides.set(flagName, enabled);
    localStorage.setItem(
      'feature_flags_overrides',
      JSON.stringify(Array.from(this.localOverrides.entries()))
    );

    analytics.track('feature_discovered', {
      feature_name: flagName,
      discovery_method: 'manual_override',
      enabled,
    });
  }

  /**
   * Clear local override
   */
  public clearLocalOverride(flagName: string) {
    this.localOverrides.delete(flagName);
    localStorage.setItem(
      'feature_flags_overrides',
      JSON.stringify(Array.from(this.localOverrides.entries()))
    );
  }

  /**
   * Clear all local overrides
   */
  public clearAllOverrides() {
    this.localOverrides.clear();
    localStorage.removeItem('feature_flags_overrides');
  }

  /**
   * Track feature usage
   */
  public trackFeatureUsage(flagName: string) {
    if (this.isEnabled(flagName)) {
      analytics.track('feature_discovered', {
        feature_name: flagName,
        discovery_method: 'usage',
      });
    }
  }

  /**
   * Load config from storage
   */
  private async loadConfig() {
    try {
      const savedConfig = localStorage.getItem('feature_flags_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        this.config = {
          ...this.config,
          ...parsed,
          flags: { ...this.config.flags, ...parsed.flags },
        };
      }
    } catch (error) {
      console.error('Failed to load feature flags config:', error);
    }
  }

  /**
   * Load local overrides
   */
  private loadLocalOverrides() {
    try {
      const savedOverrides = localStorage.getItem('feature_flags_overrides');
      if (savedOverrides) {
        const entries: [string, boolean][] = JSON.parse(savedOverrides);
        this.localOverrides = new Map(entries);
      }
    } catch (error) {
      console.error('Failed to load feature flags overrides:', error);
    }
  }

  /**
   * Load user properties
   */
  private loadUserProperties() {
    try {
      const savedProps = localStorage.getItem('feature_flags_user_properties');
      if (savedProps) {
        this.userProperties = JSON.parse(savedProps);
      }
    } catch (error) {
      console.error('Failed to load user properties:', error);
    }
  }

  /**
   * Fetch remote flags from backend
   */
  private async fetchRemoteFlags() {
    try {
      const remoteFlags = await invoke<Record<string, boolean>>(
        'feature_flag_get_all'
      );

      // Merge remote flags with local config
      Object.entries(remoteFlags).forEach(([name, enabled]) => {
        if (this.config.flags[name]) {
          this.config.flags[name].enabled = enabled;
        } else {
          this.config.flags[name] = {
            name,
            enabled,
            enabledForAll: enabled,
          };
        }
      });

      // Update timestamp
      this.config.lastUpdated = Date.now();

      // Save to storage
      localStorage.setItem(
        'feature_flags_config',
        JSON.stringify(this.config)
      );
    } catch (error) {
      console.error('Failed to fetch remote feature flags:', error);
    }
  }

  /**
   * Start periodic updates
   */
  private startPeriodicUpdates() {
    // Update every 5 minutes
    this.updateInterval = window.setInterval(() => {
      this.fetchRemoteFlags();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop periodic updates
   */
  public stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): FeatureFlagConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const featureFlags = new FeatureFlagsService();

// Export for testing
export { FeatureFlagsService };
