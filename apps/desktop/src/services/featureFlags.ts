import { invoke } from '../lib/tauri-mock';
import { FeatureFlag, FeatureFlagConfig, UserProperties } from '../types/analytics';
import { analytics } from './analytics';

export enum FeatureFlagName {
  PARALLEL_EXECUTION = 'parallel_execution',
  AUTONOMOUS_AGENT = 'autonomous_agent',
  VISION_AUTOMATION = 'vision_automation',

  NEW_DASHBOARD = 'new_dashboard',
  DARK_MODE = 'dark_mode',
  COMMAND_PALETTE = 'command_palette',

  BROWSER_AUTOMATION = 'browser_automation',
  DATABASE_INTEGRATION = 'database_integration',
  API_AUTOMATION = 'api_automation',

  STREAMING_RESPONSES = 'streaming_responses',
  CODE_COMPLETION = 'code_completion',
  FUNCTION_CALLING = 'function_calling',

  RESPONSE_CACHING = 'response_caching',
  PREFETCHING = 'prefetching',

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

  private async initializeService() {
    try {
      await this.loadConfig();

      this.loadLocalOverrides();

      this.loadUserProperties();

      await this.fetchRemoteFlags();

      this.startPeriodicUpdates();
    } catch (error) {
      console.error('Failed to initialize feature flags:', error);
    }
  }

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

  public isEnabled(flagName: string | FeatureFlagName): boolean {
    if (this.localOverrides.has(flagName)) {
      return this.localOverrides.get(flagName) || false;
    }

    const flag = this.config.flags[flagName];
    if (!flag || !flag.enabled) {
      return false;
    }

    if (flag.enabledForAll) {
      return true;
    }

    if (flag.targetUserIds && this.userProperties.userId) {
      if (flag.targetUserIds.includes(this.userProperties.userId)) {
        return true;
      }
    }

    if (flag.targetPlanTiers && this.userProperties.plan_tier) {
      if (flag.targetPlanTiers.includes(this.userProperties.plan_tier)) {
        return true;
      }
    }

    if (flag.rolloutPercentage !== undefined) {
      return this.isInRollout(flagName, flag.rolloutPercentage);
    }

    return false;
  }

  private isInRollout(flagName: string, percentage: number): boolean {
    if (!this.userProperties.userId) {
      return false;
    }

    const hash = this.hashString(`${flagName}-${this.userProperties.userId}`);
    const bucket = hash % 100;
    return bucket < percentage;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  public getEnabledFeatures(): string[] {
    return Object.keys(this.config.flags).filter((flag) => this.isEnabled(flag));
  }

  public getFlag(flagName: string): FeatureFlag | undefined {
    return this.config.flags[flagName];
  }

  public getAllFlags(): Record<string, FeatureFlag> {
    return { ...this.config.flags };
  }

  public setUserProperties(properties: Partial<UserProperties>) {
    this.userProperties = { ...this.userProperties, ...properties };
    localStorage.setItem('feature_flags_user_properties', JSON.stringify(this.userProperties));
  }

  public setLocalOverride(flagName: string, enabled: boolean) {
    this.localOverrides.set(flagName, enabled);
    localStorage.setItem(
      'feature_flags_overrides',
      JSON.stringify(Array.from(this.localOverrides.entries())),
    );

    analytics.track('feature_discovered', {
      feature_name: flagName,
      discovery_method: 'manual_override',
      enabled,
    });
  }

  public clearLocalOverride(flagName: string) {
    this.localOverrides.delete(flagName);
    localStorage.setItem(
      'feature_flags_overrides',
      JSON.stringify(Array.from(this.localOverrides.entries())),
    );
  }

  public clearAllOverrides() {
    this.localOverrides.clear();
    localStorage.removeItem('feature_flags_overrides');
  }

  public trackFeatureUsage(flagName: string) {
    if (this.isEnabled(flagName)) {
      analytics.track('feature_discovered', {
        feature_name: flagName,
        discovery_method: 'usage',
      });
    }
  }

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

  private async fetchRemoteFlags() {
    try {
      const remoteFlags = await invoke<Record<string, boolean>>('feature_flag_get_all');

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

      this.config.lastUpdated = Date.now();

      localStorage.setItem('feature_flags_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to fetch remote feature flags:', error);
    }
  }

  private startPeriodicUpdates() {
    this.updateInterval = window.setInterval(
      () => {
        void this.fetchRemoteFlags().catch((error) => {
          console.error('Failed to fetch remote feature flags:', error);
        });
      },
      5 * 60 * 1000,
    );
  }

  public stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  public getConfig(): FeatureFlagConfig {
    return { ...this.config };
  }
}

export const featureFlags = new FeatureFlagsService();

export { FeatureFlagsService };
