/**
 * configDefaults.test.ts — A3 guarantee.
 *
 * Asserts that the DEFAULTS in `utils/config.ts` match the `default` field
 * declared in `package.json contributes.configuration`. Prevents the drift
 * the senior review flagged: a literal in code (e.g. `?? 300`) silently
 * diverging from the package.json default (also `300`) until someone changes
 * package.json without touching the code.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { __CONFIG_DEFAULTS } from '../platform/config';

interface PkgConfigContrib {
  type: string;
  default?: unknown;
  description?: string;
}

interface ExtensionPackageJson {
  contributes?: {
    configuration?: { properties?: Record<string, PkgConfigContrib> };
    commands?: Array<{ command: string; title: string }>;
  };
  capabilities?: {
    untrustedWorkspaces?: {
      restrictedConfigurations?: string[];
    };
  };
}

function readPackageJson(): ExtensionPackageJson {
  const pkgPath = path.resolve(__dirname, '../../package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as ExtensionPackageJson;
}

function readPkgConfigSettings(): Record<string, PkgConfigContrib> {
  return readPackageJson().contributes?.configuration?.properties ?? {};
}

/** Map from DEFAULTS key → package.json `agiWorkforce.<x>` setting key. */
const KEY_MAP: Record<keyof typeof __CONFIG_DEFAULTS, string> = {
  agentPlanMode: 'agiWorkforce.agent.planMode',
  agentMode: 'agiWorkforce.agent.mode',
  agentEffort: 'agiWorkforce.agent.effort',
  agentThinking: 'agiWorkforce.agent.thinking',
  codeLensEnabled: 'agiWorkforce.codeLensEnabled',
  hoverEnabled: 'agiWorkforce.hoverEnabled',
  inlineCompletionsEnabled: 'agiWorkforce.inlineCompletions.enabled',
  inlineCompletionsDebounceMs: 'agiWorkforce.inlineCompletions.debounceMs',
  inlineCompletionsMaxLength: 'agiWorkforce.inlineCompletions.maxLength',
  mcpEnabled: 'agiWorkforce.mcp.enabled',
  model: 'agiWorkforce.model',
  streamingEnabled: 'agiWorkforce.streamingEnabled',
  contextLines: 'agiWorkforce.contextLines',
  telemetryEnabled: 'agiWorkforce.telemetryEnabled',
  telemetryEndpoint: 'agiWorkforce.telemetryEndpoint',
  useProviderStream: 'agiWorkforce.useProviderStream',
  desktopBridgeEnabled: 'agiWorkforce.desktopBridge.enabled',
  desktopBridgePort: 'agiWorkforce.desktopBridge.port',
  tier: 'agiWorkforce.tier',
  currentTier: 'agiWorkforce.currentTier',
  cliPath: 'agiWorkforce.cliPath',
};

describe('Config DEFAULTS ↔ package.json parity', () => {
  const pkgSettings = readPkgConfigSettings();

  for (const [defaultsKey, pkgKey] of Object.entries(KEY_MAP) as Array<
    [keyof typeof __CONFIG_DEFAULTS, string]
  >) {
    it(`${defaultsKey} matches package.json '${pkgKey}'`, () => {
      const pkgDefault = pkgSettings[pkgKey]?.default;
      expect(
        pkgDefault,
        `package.json is missing the '${pkgKey}' configuration entry that Config.${defaultsKey}() depends on`,
      ).toBeDefined();
      expect(__CONFIG_DEFAULTS[defaultsKey]).toEqual(pkgDefault);
    });
  }

  it('every Config DEFAULT has a corresponding package.json setting', () => {
    const missing: string[] = [];
    for (const key of Object.keys(__CONFIG_DEFAULTS)) {
      const pkgKey = KEY_MAP[key as keyof typeof __CONFIG_DEFAULTS];
      if (pkgSettings[pkgKey] === undefined) {
        missing.push(`${key} -> ${pkgKey}`);
      }
    }
    expect(
      missing,
      `Config keys with no matching package.json setting: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the optional Desktop bridge opt-in for a clean public install', () => {
    expect(__CONFIG_DEFAULTS.desktopBridgeEnabled).toBe(false);
    expect(pkgSettings['agiWorkforce.desktopBridge.enabled']?.default).toBe(false);
  });

  it('requires an explicit opt-in before sending editor context for inline completions', () => {
    expect(__CONFIG_DEFAULTS.inlineCompletionsEnabled).toBe(false);
    expect(pkgSettings['agiWorkforce.inlineCompletions.enabled']?.default).toBe(false);
    expect(pkgSettings['agiWorkforce.inlineCompletions.enabled']?.description).toContain(
      'surrounding code',
    );
  });

  it('describes Auto mode using the runtime safe-tool approval boundary', () => {
    const description = pkgSettings['agiWorkforce.agent.mode']?.description ?? '';
    const commandSetup = fs.readFileSync(
      path.resolve(__dirname, '../core/commandSetup.ts'),
      'utf8',
    );

    expect(description).toContain('safe, read-only');
    expect(description).toContain('writes and commands still require approval');
    expect(commandSetup).not.toContain('Edits run without confirmation');
  });

  it('keeps Thinking scoped to cloud utilities and out of the local action sheet', () => {
    const commandSetup = fs.readFileSync(
      path.resolve(__dirname, '../core/commandSetup.ts'),
      'utf8',
    );

    expect(pkgSettings['agiWorkforce.agent.thinking']?.description).toContain(
      'cloud-backed editor utilities',
    );
    expect(commandSetup).not.toContain('label: `$(lightbulb) Thinking:');
    expect(commandSetup).not.toContain("case 'thinking':");
  });

  it('distinguishes the extension MCP toggle from app-server MCP configuration', () => {
    const description = pkgSettings['agiWorkforce.mcp.enabled']?.description ?? '';

    expect(description).toContain('cloud-backed editor utilities');
    expect(description).toContain('does not control the local app-server');
  });

  it('exposes only canonical shipped tier names', () => {
    const tier = pkgSettings['agiWorkforce.tier'] as PkgConfigContrib & { enum?: string[] };
    expect(tier.enum).toEqual([
      'local',
      'byok',
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'enterprise',
    ]);
  });

  it('labels the opt-in provider stream as a cloud utility transport', () => {
    expect(pkgSettings['agiWorkforce.useProviderStream']?.description).toContain(
      'cloud-backed editor utilities',
    );
    expect(pkgSettings['agiWorkforce.providerStreamProvider']).toBeUndefined();
  });

  it('restricts only settings that the extension actually contributes', () => {
    const restricted =
      readPackageJson().capabilities?.untrustedWorkspaces?.restrictedConfigurations ?? [];

    expect(restricted.length).toBeGreaterThan(0);
    expect(restricted.filter((key) => pkgSettings[key] === undefined)).toEqual([]);
  });

  it('presents the legacy invite command id as sign-in, not a private-beta gate', () => {
    const command = readPackageJson().contributes?.commands?.find(
      (entry) => entry.command === 'agi-workforce.openInviteCodeModal',
    );

    expect(command?.title).toBe('AGI Workforce: Sign In to AGI Cloud');
  });
});
