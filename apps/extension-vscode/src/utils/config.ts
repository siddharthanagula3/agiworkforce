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
 * Trust-restricted accessors live in `utils/api.ts` (`getCloudApiEndpoint`,
 * `getGatewayUrl`) — they read `inspect().globalValue` only, refusing the
 * workspace override. This module covers the non-trust-sensitive keys.
 *
 * Settings NOT covered by this module:
 *   - `apiEndpoint` / `gatewayUrl` / `modelEndpoint` — see `utils/api.ts`
 *   - `cliPath` / `systemPrompt` / `agent.autoApply` — handled at use-site
 *     with explicit Workspace Trust check
 */

import * as vscode from 'vscode';

/** Default values mirror those declared in `package.json` `contributes.configuration`. */
const DEFAULTS = {
  agentMaxIterations: 25,
  agentPlanMode: false,
  agentMode: 'auto',
  agentEffort: 'medium',
  codeLensEnabled: true,
  inlineCompletionsEnabled: false,
  inlineCompletionsDebounceMs: 300,
  inlineCompletionsMaxLength: 500,
  mcpEnabled: false,
  model: 'auto-balanced',
  streamingEnabled: true,
  contextLines: 50,
  fallbackToVscodeLm: true,
  telemetryEnabled: false,
  telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
  useProviderStream: false,
  providerStreamProvider: 'auto',
  desktopBridgeEnabled: true,
  desktopBridgePort: 8787,
} as const;

function get<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('agiWorkforce').get<T>(key) ?? fallback;
}

/** Single-call helpers for the non-trust-sensitive settings. */
export const Config = {
  // ── Agent mode ──────────────────────────────────────────────────────────
  agentMaxIterations(): number {
    return get<number>('agent.maxIterations', DEFAULTS.agentMaxIterations);
  },
  agentPlanMode(): boolean {
    return get<boolean>('agent.planMode', DEFAULTS.agentPlanMode);
  },
  /**
   * Resolve the effective agent mode:
   *  1. If `agent.mode` has been explicitly set, use it.
   *  2. Otherwise, fall back to `agent.planMode` backwards-compat alias:
   *     `true` → 'plan', `false` → 'auto'.
   */
  agentMode(): 'ask' | 'auto' | 'plan' | 'bypass' {
    const raw = get<string>('agent.mode', DEFAULTS.agentMode);
    if (raw === 'ask' || raw === 'auto' || raw === 'plan' || raw === 'bypass') return raw;
    // Backwards-compat: fall through to deprecated planMode alias
    return get<boolean>('agent.planMode', false) ? 'plan' : 'auto';
  },
  agentEffort(): 'low' | 'medium' | 'high' | 'max' {
    const raw = get<string>('agent.effort', DEFAULTS.agentEffort);
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'max') return raw;
    return 'medium';
  },

  // ── CodeLens / inline completions ───────────────────────────────────────
  codeLensEnabled(): boolean {
    return get<boolean>('codeLensEnabled', DEFAULTS.codeLensEnabled);
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
  contextLines(): number {
    return get<number>('contextLines', DEFAULTS.contextLines);
  },
  fallbackToVscodeLm(): boolean {
    return get<boolean>('fallbackToVscodeLm', DEFAULTS.fallbackToVscodeLm);
  },
  useProviderStream(): boolean {
    return get<boolean>('useProviderStream', DEFAULTS.useProviderStream);
  },
  providerStreamProvider(): string {
    return get<string>('providerStreamProvider', DEFAULTS.providerStreamProvider);
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
} as const;

/** Test-only: expose defaults for assertion tests. */
export const __CONFIG_DEFAULTS = DEFAULTS;
