/**
 * config.ts — Typed accessors for `agiWorkforce.*` settings (A3).
 *
 * Replaces the 31 raw `vscode.workspace.getConfiguration('agiWorkforce').get<T>(...)`
 * callsites scattered across the codebase. Benefits:
 *   1. Defaults centralised — no more `?? 300` drifting from `package.json` default
 *   2. Type safety — accessors return the correct type, no `<unknown>`
 *   3. Workspace-trust gating — sensitive endpoint accessors honor `isTrusted`
 *      via `getGlobalConfig` (security fix VSCODE-01)
 *   4. Discoverability — every setting key the extension actually reads is in
 *      ONE file; new settings get a typed entry here
 *
 * Trust-restricted runtime accessors also live in `utils/api.ts`
 * (`getCloudApiEndpoint`, `getGatewayUrl`). The settings panel uses the
 * user-scoped accessors here so an untrusted workspace can never supply or
 * receive a sensitive endpoint value through the webview.
 */

import * as vscode from 'vscode';
import {
  enforceAgentModeConsent,
  setAgentEffortWithConsent,
  setAgentModeWithConsent,
  type ExtensionAgentMode,
} from '../features/permissions/agentModeConsent';

export type ExtensionAgentEffort = 'low' | 'medium' | 'high' | 'max';
export type ComposerFollowUpBehavior = 'queue' | 'steer';
export type ExtensionTier =
  | 'local'
  | 'byok'
  | 'free'
  | 'basic'
  | 'pro'
  | 'max'
  | 'max_15x'
  | 'team'
  | 'enterprise';

/** Mutable settings exposed by the branded settings panel. */
export interface MutableConfigValues {
  apiEndpoint: string;
  model: string;
  cliPath: string;
  streamingEnabled: boolean;
  'composer.followUpBehavior': ComposerFollowUpBehavior;
  contextLines: number;
  telemetryEnabled: boolean;
  hoverEnabled: boolean;
  codeLensEnabled: boolean;
  autoApplyFixes: boolean;
  'inlineCompletions.enabled': boolean;
  'inlineCompletions.debounceMs': number;
  'inlineCompletions.maxLength': number;
  'agent.mode': ExtensionAgentMode;
  'agent.effort': ExtensionAgentEffort;
  'agent.thinking': boolean;
  'mcp.enabled': boolean;
  'desktopBridge.enabled': boolean;
  'desktopBridge.port': number;
  telemetryEndpoint: string;
  useProviderStream: boolean;
  gatewayUrl: string;
  tier: ExtensionTier;
}

export type MutableConfigKey = keyof MutableConfigValues;
export type ConfigSettingUpdate = {
  [K in MutableConfigKey]: { key: K; value: MutableConfigValues[K] };
}[MutableConfigKey];

export const SETTINGS_PANEL_SETTING_KEYS = [
  'apiEndpoint',
  'model',
  'cliPath',
  'streamingEnabled',
  'contextLines',
  'telemetryEnabled',
  'hoverEnabled',
  'codeLensEnabled',
  'autoApplyFixes',
  'inlineCompletions.enabled',
  'inlineCompletions.debounceMs',
  'inlineCompletions.maxLength',
  'agent.mode',
  'agent.effort',
  'agent.thinking',
  'composer.followUpBehavior',
  'mcp.enabled',
  'desktopBridge.enabled',
  'desktopBridge.port',
  'telemetryEndpoint',
  'useProviderStream',
  'gatewayUrl',
  'tier',
] as const satisfies readonly MutableConfigKey[];

export interface ExtensionSettingsSnapshot {
  values: MutableConfigValues & { currentTier: string };
  workspaceOverrides: MutableConfigKey[];
  workspaceTrusted: boolean;
}

/** Default values mirror those declared in `package.json` `contributes.configuration`. */
const DEFAULTS = {
  apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
  agentPlanMode: false,
  agentMode: 'auto',
  agentEffort: 'medium',
  agentThinking: false,
  // Off by default: four lenses above every declaration in every open file is
  // more chrome than the editor's own lenses, and the same actions are reachable
  // from the context menu and the sidebar. Opt-in via agiWorkforce.codeLensEnabled.
  codeLensEnabled: false,
  hoverEnabled: false,
  autoApplyFixes: false,
  inlineCompletionsEnabled: false,
  inlineCompletionsDebounceMs: 300,
  inlineCompletionsMaxLength: 500,
  mcpEnabled: false,
  model: 'auto',
  streamingEnabled: true,
  composerFollowUpBehavior: 'queue',
  contextLines: 50,
  telemetryEnabled: false,
  telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
  useProviderStream: false,
  desktopBridgeEnabled: false,
  desktopBridgePort: 8787,
  tier: 'byok',
  currentTier: 'unknown',
  cliPath: 'agi',
  gatewayUrl: 'https://api.agiworkforce.com',
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

/** Single-call helpers and the typed settings-panel write boundary. */
export const Config = {
  // ── Agent mode ──────────────────────────────────────────────────────────
  agentPlanMode(): boolean {
    return get<boolean>('agent.planMode', DEFAULTS.agentPlanMode);
  },
  /**
   * Resolve the effective agent mode:
   *  1. If `agent.mode` has been explicitly set, use it.
   *  2. Otherwise, fall back to `agent.planMode` backwards-compat alias:
   *     `true` → 'plan', `false` → 'auto'.
   */
  agentMode(): ExtensionAgentMode {
    const raw = get<string>('agent.mode', DEFAULTS.agentMode);
    if (raw === 'ask' || raw === 'auto' || raw === 'plan' || raw === 'bypass') {
      return enforceAgentModeConsent(raw);
    }
    // Backwards-compat: fall through to deprecated planMode alias
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

  // ── Hover actions ───────────────────────────────────────────────────────
  hoverEnabled(): boolean {
    return get<boolean>('hoverEnabled', DEFAULTS.hoverEnabled);
  },

  // ── CodeLens / inline completions ───────────────────────────────────────
  codeLensEnabled(): boolean {
    return get<boolean>('codeLensEnabled', DEFAULTS.codeLensEnabled);
  },
  autoApplyFixes(): boolean {
    return get<boolean>('autoApplyFixes', DEFAULTS.autoApplyFixes);
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

  // ── Provider routing ────────────────────────────────────────────────────
  model(): string {
    return get<string>('model', DEFAULTS.model);
  },
  streamingEnabled(): boolean {
    return get<boolean>('streamingEnabled', DEFAULTS.streamingEnabled);
  },
  composerFollowUpBehavior(): ComposerFollowUpBehavior {
    const raw = get<string>('composer.followUpBehavior', DEFAULTS.composerFollowUpBehavior);
    return raw === 'steer' ? 'steer' : 'queue';
  },
  contextLines(): number {
    return get<number>('contextLines', DEFAULTS.contextLines);
  },
  useProviderStream(): boolean {
    return get<boolean>('useProviderStream', DEFAULTS.useProviderStream);
  },
  apiEndpoint(): string {
    return getUserScoped<string>('apiEndpoint', DEFAULTS.apiEndpoint);
  },
  gatewayUrl(): string {
    return getUserScoped<string>('gatewayUrl', DEFAULTS.gatewayUrl);
  },

  // ── MCP + desktop bridge ────────────────────────────────────────────────
  mcpEnabled(): boolean {
    return get<boolean>('mcp.enabled', DEFAULTS.mcpEnabled);
  },
  desktopBridgeEnabled(): boolean {
    return get<boolean>('desktopBridge.enabled', DEFAULTS.desktopBridgeEnabled);
  },
  desktopBridgePort(): number {
    return get<number>('desktopBridge.port', DEFAULTS.desktopBridgePort);
  },

  // ── Telemetry ───────────────────────────────────────────────────────────
  telemetryEnabled(): boolean {
    return get<boolean>('telemetryEnabled', DEFAULTS.telemetryEnabled);
  },
  telemetryEndpoint(): string {
    return get<string>('telemetryEndpoint', DEFAULTS.telemetryEndpoint);
  },

  // ── Tier override ────────────────────────────────────────────────────────
  /**
   * Read the explicit tier override from settings.
   * Returns 'byok' (the default) when not set by the user.
   * The tierResolver uses this as priority-1 in its resolution chain.
   */
  tier(): ExtensionTier {
    const raw = get<string>('tier', DEFAULTS.tier);
    if (
      raw === 'local' ||
      raw === 'byok' ||
      raw === 'free' ||
      raw === 'basic' ||
      raw === 'pro' ||
      raw === 'max' ||
      raw === 'max_15x' ||
      raw === 'team' ||
      raw === 'enterprise'
    ) {
      return raw;
    }
    return DEFAULTS.tier;
  },

  /**
   * Read the cached current tier from global (user-scoped) settings only.
   * Workspace values are ignored to prevent untrusted-workspace tier spoofing.
   */
  currentTier(): string {
    const inspected = vscode.workspace
      .getConfiguration('agiWorkforce')
      .inspect<string>('currentTier');
    return inspected?.globalValue ?? DEFAULTS.currentTier;
  },

  /**
   * Executable used for the workspace-scoped local developer runtime.
   * Untrusted workspaces cannot replace it with a workspace-authored binary.
   */
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
        streamingEnabled: this.streamingEnabled(),
        'composer.followUpBehavior': this.composerFollowUpBehavior(),
        contextLines: this.contextLines(),
        telemetryEnabled: this.telemetryEnabled(),
        hoverEnabled: this.hoverEnabled(),
        codeLensEnabled: this.codeLensEnabled(),
        autoApplyFixes: this.autoApplyFixes(),
        'inlineCompletions.enabled': this.inlineCompletionsEnabled(),
        'inlineCompletions.debounceMs': this.inlineCompletionsDebounceMs(),
        'inlineCompletions.maxLength': this.inlineCompletionsMaxLength(),
        'agent.mode': this.agentMode(),
        'agent.effort': this.agentEffort(),
        'agent.thinking': this.agentThinking(),
        'mcp.enabled': this.mcpEnabled(),
        'desktopBridge.enabled': this.desktopBridgeEnabled(),
        'desktopBridge.port': this.desktopBridgePort(),
        telemetryEndpoint: this.telemetryEndpoint(),
        useProviderStream: this.useProviderStream(),
        gatewayUrl: this.gatewayUrl(),
        tier: this.tier(),
        currentTier: this.currentTier(),
      },
      workspaceOverrides: workspaceOverrides(),
      workspaceTrusted: vscode.workspace.isTrusted,
    };
  },

  /**
   * Persist a validated setting at user scope. Agent mode is deliberately
   * routed through the versioned bypass-consent boundary instead of writing
   * directly.
   */
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

/** Test-only: expose defaults for assertion tests. */
export const __CONFIG_DEFAULTS = DEFAULTS;
