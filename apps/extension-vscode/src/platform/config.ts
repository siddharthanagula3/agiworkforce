/**
 * Sensitive settings are read from user scope only, and `cliPath` honours a
 * workspace value only in a trusted workspace, so an untrusted workspace can
 * never supply an endpoint or executable, nor receive one through the settings
 * webview. The runtime's trust-restricted endpoint is `getCloudApiEndpoint` in
 * `utils/api.ts`.
 */

import { getBillingPlanPricing, isBillingPlanTier } from '@agiworkforce/types';
import { DEVELOPER_REASONING_EFFORTS } from '@agiworkforce/local-runtime-contract';
import * as vscode from 'vscode';
import { nodeCliResolutionHost, resolveCliPath, type CliResolution } from './remoteEnvironment';
import {
  enforceAgentModeConsent,
  setAgentEffortWithConsent,
  setAgentModeWithConsent,
  type ExtensionAgentEffort,
  type ExtensionAgentMode,
} from '../features/permissions/agentModeConsent';

export type { ExtensionAgentEffort };
export type ComposerFollowUpBehavior = 'queue' | 'steer';
export type ComposerEnterBehavior = 'enter' | 'modifierIfMultiline' | 'modifier';
const COMPOSER_ENTER_BEHAVIORS: readonly ComposerEnterBehavior[] = [
  'enter',
  'modifierIfMultiline',
  'modifier',
];
export interface MutableConfigValues {
  apiEndpoint: string;
  model: string;
  cliPath: string;
  'composer.followUpBehavior': ComposerFollowUpBehavior;
  'composer.enterBehavior': ComposerEnterBehavior;
  contextLines: number;
  'editorContext.autoAttach': boolean;
  respectGitIgnore: boolean;
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
  activateOnStartup: boolean;
  useTerminal: boolean;
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
  'composer.enterBehavior',
  'editorContext.autoAttach',
  'respectGitIgnore',
  'activateOnStartup',
  'useTerminal',
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
  composerEnterBehavior: 'enter',
  contextLines: 50,
  editorContextAutoAttach: true,
  respectGitIgnore: true,
  telemetryEnabled: false,
  cliPath: 'agi',
  activateOnStartup: false,
  useTerminal: false,
} as const;

function get<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('agiWorkforce').get<T>(key) ?? fallback;
}

function getUserScoped<T>(key: string, fallback: T): T {
  const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
}

function repositoryValues<T>(key: string): T[] {
  const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<T>(key);
  const folderValues = (vscode.workspace.workspaceFolders ?? []).map(
    (folder) =>
      vscode.workspace.getConfiguration('agiWorkforce', folder.uri).inspect<T>(key)
        ?.workspaceFolderValue,
  );
  return [inspected?.workspaceValue, inspected?.workspaceFolderValue, ...folderValues].filter(
    (value): value is T => value !== undefined,
  );
}

function userChoiceNarrowedByWorkspace(
  key: string,
  fallback: boolean,
  privateValue: boolean,
): boolean {
  const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<boolean>(key);
  const userValue = inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
  return repositoryValues<boolean>(key).includes(privateValue) ? privateValue : userValue;
}

const OPT_OUT_SETTING_BY_FEATURE = {
  'memory.enabled': 'optOut.memory',
  'inlineCompletions.enabled': 'optOut.inlineCompletions',
  autoApplyFixes: 'optOut.autoApplyFixes',
} as const satisfies Partial<Record<MutableConfigKey, string>>;

export type OptOutFeature = keyof typeof OPT_OUT_SETTING_BY_FEATURE;
export const OPT_OUT_SETTING_KEYS = Object.values(OPT_OUT_SETTING_BY_FEATURE);

export function optOutSettingFor(feature: OptOutFeature): string {
  return `agiWorkforce.${OPT_OUT_SETTING_BY_FEATURE[feature]}`;
}

function isOptOutFeature(key: MutableConfigKey): key is OptOutFeature {
  return key in OPT_OUT_SETTING_BY_FEATURE;
}

function optedOutHere(feature: OptOutFeature): boolean {
  const key = OPT_OUT_SETTING_BY_FEATURE[feature];
  const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<boolean>(key);
  return inspected?.globalValue === true || repositoryValues<boolean>(key).includes(true);
}

function userChoiceUnlessOptedOut(feature: OptOutFeature, fallback: boolean): boolean {
  return getUserScoped<boolean>(feature, fallback) && !optedOutHere(feature);
}

function workspaceOverrides(values: MutableConfigValues): MutableConfigKey[] {
  const configuration = vscode.workspace.getConfiguration('agiWorkforce');
  return SETTINGS_PANEL_SETTING_KEYS.filter((key) => {
    const overridden = isOptOutFeature(key)
      ? optedOutHere(key)
      : repositoryValues<unknown>(key).length > 0;
    if (!overridden) return false;
    const inspected = configuration.inspect<unknown>(key);
    return values[key] !== (inspected?.globalValue ?? inspected?.defaultValue);
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
    return DEVELOPER_REASONING_EFFORTS.find((effort) => effort === raw) ?? 'medium';
  },
  planModeActive(): boolean {
    return Config.agentMode() === 'plan' || Config.agentPlanMode();
  },
  agentThinking(): boolean {
    return get<boolean>('agent.thinking', DEFAULTS.agentThinking);
  },
  activateOnStartup(): boolean {
    return getUserScoped<boolean>('activateOnStartup', DEFAULTS.activateOnStartup);
  },
  useTerminal(): boolean {
    return getUserScoped<boolean>('useTerminal', DEFAULTS.useTerminal);
  },

  hoverEnabled(): boolean {
    return get<boolean>('hoverEnabled', DEFAULTS.hoverEnabled);
  },

  codeLensEnabled(): boolean {
    return get<boolean>('codeLensEnabled', DEFAULTS.codeLensEnabled);
  },
  autoApplyFixes(): boolean {
    return userChoiceUnlessOptedOut('autoApplyFixes', DEFAULTS.autoApplyFixes);
  },
  memoryEnabled(): boolean {
    return userChoiceUnlessOptedOut('memory.enabled', DEFAULTS.memoryEnabled);
  },
  memoryUserSetting(): boolean {
    return getUserScoped<boolean>('memory.enabled', DEFAULTS.memoryEnabled);
  },
  memoryOptedOutHere(): boolean {
    return optedOutHere('memory.enabled');
  },
  inlineCompletionsEnabled(): boolean {
    return userChoiceUnlessOptedOut('inlineCompletions.enabled', DEFAULTS.inlineCompletionsEnabled);
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
  composerEnterBehavior(): ComposerEnterBehavior {
    const raw = get<string>('composer.enterBehavior', DEFAULTS.composerEnterBehavior);
    return COMPOSER_ENTER_BEHAVIORS.find((behavior) => behavior === raw) ?? 'enter';
  },
  contextLines(): number {
    return get<number>('contextLines', DEFAULTS.contextLines);
  },
  editorContextAutoAttach(): boolean {
    return userChoiceNarrowedByWorkspace(
      'editorContext.autoAttach',
      DEFAULTS.editorContextAutoAttach,
      false,
    );
  },
  respectGitIgnore(): boolean {
    return userChoiceNarrowedByWorkspace('respectGitIgnore', DEFAULTS.respectGitIgnore, true);
  },
  apiEndpoint(): string {
    return getUserScoped<string>('apiEndpoint', DEFAULTS.apiEndpoint);
  },

  telemetryEnabled(): boolean {
    return getUserScoped<boolean>('telemetryEnabled', DEFAULTS.telemetryEnabled);
  },

  cliPath(): string {
    const inspected = vscode.workspace.getConfiguration('agiWorkforce').inspect<string>('cliPath');
    if (!vscode.workspace.isTrusted) {
      return inspected?.globalValue ?? inspected?.defaultValue ?? DEFAULTS.cliPath;
    }
    return get<string>('cliPath', DEFAULTS.cliPath);
  },

  settingsSnapshot(currentTier: string): ExtensionSettingsSnapshot {
    const values: MutableConfigValues = {
      apiEndpoint: this.apiEndpoint(),
      model: this.model(),
      cliPath: this.cliPath(),
      'composer.followUpBehavior': this.composerFollowUpBehavior(),
      'composer.enterBehavior': this.composerEnterBehavior(),
      contextLines: this.contextLines(),
      'editorContext.autoAttach': this.editorContextAutoAttach(),
      respectGitIgnore: this.respectGitIgnore(),
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
      activateOnStartup: this.activateOnStartup(),
      useTerminal: this.useTerminal(),
    };
    return {
      values: { ...values, currentTier, currentTierLabel: currentTierLabel(currentTier) },
      workspaceOverrides: workspaceOverrides(values),
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

export function resolveConfiguredCli(): CliResolution {
  return resolveCliPath(
    Config.cliPath(),
    nodeCliResolutionHost(
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    ),
  );
}
