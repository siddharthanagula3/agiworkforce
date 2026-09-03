import { getBillingPlanPricing, isBillingPlanTier } from '@agiworkforce/types';
import * as vscode from 'vscode';
import {
  enforceAgentModeConsent,
  setAgentEffortWithConsent,
  setAgentModeWithConsent,
  type ExtensionAgentMode,
} from '../features/permissions/agentModeConsent';

export type ExtensionAgentEffort = 'low' | 'medium' | 'high' | 'max';
export type ComposerFollowUpBehavior = 'queue' | 'steer';
export interface MutableConfigValues {
  apiEndpoint: string;
  model: string;
  cliPath: string;
  'composer.followUpBehavior': ComposerFollowUpBehavior;
  contextLines: number;
  telemetryEnabled: boolean;
  hoverEnabled: boolean;
  codeLensEnabled: boolean;
  autoApplyFixes: boolean;
  'memory.enabled': boolean;
  'inlineCompletions.enabled': boolean;
  'inlineCompletions.debounceMs': number;
  'inlineCompletions.maxLength': number;
  'agent.mode': ExtensionAgentMode;
  'agent.effort': ExtensionAgentEffort;
  'agent.thinking': boolean;
  'desktopBridge.enabled': boolean;
  'desktopBridge.port': number;
  telemetryEndpoint: string;
}

export type MutableConfigKey = keyof MutableConfigValues;
export type ConfigSettingUpdate = {
  [K in MutableConfigKey]: { key: K; value: MutableConfigValues[K] };
}[MutableConfigKey];

function currentTierLabel(tier: string): string {
  if (!tier || tier === 'unknown') return 'Unknown';
  return isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : tier;
}

export const SETTINGS_PANEL_SETTING_KEYS = [
  'apiEndpoint',
  'model',
  'cliPath',
  'contextLines',
  'telemetryEnabled',
  'hoverEnabled',
  'codeLensEnabled',
  'autoApplyFixes',
  'memory.enabled',
  'inlineCompletions.enabled',
  'inlineCompletions.debounceMs',
  'inlineCompletions.maxLength',
  'agent.mode',
  'agent.effort',
  'agent.thinking',
  'composer.followUpBehavior',
  'desktopBridge.enabled',
  'desktopBridge.port',
  'telemetryEndpoint',
] as const satisfies readonly MutableConfigKey[];

export interface ExtensionSettingsSnapshot {
  values: MutableConfigValues & { currentTier: string; currentTierLabel: string };
  workspaceOverrides: MutableConfigKey[];
  workspaceTrusted: boolean;
}

const DEFAULTS = {
  apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
  agentPlanMode: false,
  agentMode: 'auto',
  agentEffort: 'medium',
  agentThinking: false,
  codeLensEnabled: false,
  hoverEnabled: false,
  autoApplyFixes: false,
  memoryEnabled: true,
  inlineCompletionsEnabled: false,
  inlineCompletionsDebounceMs: 300,
  inlineCompletionsMaxLength: 500,
  model: 'auto',
  composerFollowUpBehavior: 'queue',
  contextLines: 50,
  telemetryEnabled: false,
  telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
  desktopBridgeEnabled: false,
  desktopBridgePort: 8787,
  currentTier: 'unknown',
  cliPath: 'agi',
} as const;

function get<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('agiWorkforce').get<T>(key) ?? fallback;
}

function getUserScoped<T>(key: string, fallback: T): T {
  const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
}

function workspaceOverrides(): MutableConfigKey[] {
  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  return SETTINGS_PANEL_SETTING_KEYS.filter((key) => {
    const inspected = configuration.inspect<unknown>(key);
    return inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined;
  });
}

export const Config = {
  agentPlanMode(): boolean {
    return get<boolean>('agent.planMode', DEFAULTS.agentPlanMode);
  },
  agentMode(): ExtensionAgentMode {
    const raw = get<string>('agent.mode', DEFAULTS.agentMode);
    if (raw === 'ask' || raw === 'auto' || raw === 'plan' || raw === 'bypass') {
      return enforceAgentModeConsent(raw);
    }
    return get<boolean>('agent.planMode', false) ? 'plan' : 'auto';
  },
  agentEffort(): ExtensionAgentEffort {
    const raw = get<string>('agent.effort', DEFAULTS.agentEffort);
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'max') return raw;
    return 'medium';
  },
  agentThinking(): boolean {
    return get<boolean>('agent.thinking', DEFAULTS.agentThinking);
  },

  hoverEnabled(): boolean {
    return get<boolean>('hoverEnabled', DEFAULTS.hoverEnabled);
  },

  codeLensEnabled(): boolean {
    return get<boolean>('codeLensEnabled', DEFAULTS.codeLensEnabled);
  },
  autoApplyFixes(): boolean {
    return get<boolean>('autoApplyFixes', DEFAULTS.autoApplyFixes);
  },
  memoryEnabled(): boolean {
    return get<boolean>('memory.enabled', DEFAULTS.memoryEnabled);
  },
  inlineCompletionsEnabled(): boolean {
    return get<boolean>('inlineCompletions.enabled', DEFAULTS.inlineCompletionsEnabled);
  },
  inlineCompletionsDebounceMs(): number {
    return get<number>('inlineCompletions.debounceMs', DEFAULTS.inlineCompletionsDebounceMs);
  },
  inlineCompletionsMaxLength(): number {
    return get<number>('inlineCompletions.maxLength', DEFAULTS.inlineCompletionsMaxLength);
  },

  model(): string {
    return getUserScoped<string>('model', DEFAULTS.model);
  },
  composerFollowUpBehavior(): ComposerFollowUpBehavior {
    const raw = get<string>('composer.followUpBehavior', DEFAULTS.composerFollowUpBehavior);
    return raw === 'steer' ? 'steer' : 'queue';
  },
  contextLines(): number {
    return get<number>('contextLines', DEFAULTS.contextLines);
  },
  apiEndpoint(): string {
    return getUserScoped<string>('apiEndpoint', DEFAULTS.apiEndpoint);
  },

  desktopBridgeEnabled(): boolean {
    return getUserScoped<boolean>('desktopBridge.enabled', DEFAULTS.desktopBridgeEnabled);
  },
  desktopBridgePort(): number {
    return getUserScoped<number>('desktopBridge.port', DEFAULTS.desktopBridgePort);
  },

  telemetryEnabled(): boolean {
    return getUserScoped<boolean>('telemetryEnabled', DEFAULTS.telemetryEnabled);
  },
  telemetryEndpoint(): string {
    return getUserScoped<string>('telemetryEndpoint', DEFAULTS.telemetryEndpoint);
  },

  currentTier(): string {
    const inspected = vscode.workspace
      .getConfiguration('agiWorkforce')
      .inspect<string>('currentTier');
    return inspected?.globalValue ?? DEFAULTS.currentTier;
  },

  cliPath(): string {
    const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<string>('cliPath');
    if (!vscode.workspace.isTrusted) {
      return inspected?.globalValue ?? inspected?.defaultValue ?? DEFAULTS.cliPath;
    }
    return get<string>('cliPath', DEFAULTS.cliPath);
  },

  settingsSnapshot(): ExtensionSettingsSnapshot {
    return {
      values: {
        apiEndpoint: this.apiEndpoint(),
        model: this.model(),
        cliPath: this.cliPath(),
        'composer.followUpBehavior': this.composerFollowUpBehavior(),
        contextLines: this.contextLines(),
        telemetryEnabled: this.telemetryEnabled(),
        hoverEnabled: this.hoverEnabled(),
        codeLensEnabled: this.codeLensEnabled(),
        autoApplyFixes: this.autoApplyFixes(),
        'memory.enabled': this.memoryEnabled(),
        'inlineCompletions.enabled': this.inlineCompletionsEnabled(),
        'inlineCompletions.debounceMs': this.inlineCompletionsDebounceMs(),
        'inlineCompletions.maxLength': this.inlineCompletionsMaxLength(),
        'agent.mode': this.agentMode(),
        'agent.effort': this.agentEffort(),
        'agent.thinking': this.agentThinking(),
        'desktopBridge.enabled': this.desktopBridgeEnabled(),
        'desktopBridge.port': this.desktopBridgePort(),
        telemetryEndpoint: this.telemetryEndpoint(),
        currentTier: this.currentTier(),
        currentTierLabel: currentTierLabel(this.currentTier()),
      },
      workspaceOverrides: workspaceOverrides(),
      workspaceTrusted: vscode.workspace.isTrusted,
    };
  },

  async update(context: vscode.ExtensionContext, update: ConfigSettingUpdate): Promise<boolean> {
    if (update.key === 'agent.mode') {
      return setAgentModeWithConsent(context, update.value);
    }
    if (update.key === 'agent.effort') {
      return setAgentEffortWithConsent(context, update.value);
    }
    await vscode.workspace
      .getConfiguration('agiWorkforce')
      .update(update.key, update.value, vscode.ConfigurationTarget.Global);
    return true;
  },
} as const;

export const __CONFIG_DEFAULTS = DEFAULTS;
