
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { __CONFIG_DEFAULTS, SETTINGS_PANEL_SETTING_KEYS } from '../platform/config';

interface PkgConfigContrib {
  type: string;
  default?: unknown;
  description?: string;
  deprecationMessage?: string;
  readOnly?: boolean;
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

const KEY_MAP: Record<keyof typeof __CONFIG_DEFAULTS, string> = {
  apiEndpoint: 'agiWorkforce.apiEndpoint',
  agentPlanMode: 'agiWorkforce.agent.planMode',
  agentMode: 'agiWorkforce.agent.mode',
  agentEffort: 'agiWorkforce.agent.effort',
  agentThinking: 'agiWorkforce.agent.thinking',
  codeLensEnabled: 'agiWorkforce.codeLensEnabled',
  hoverEnabled: 'agiWorkforce.hoverEnabled',
  autoApplyFixes: 'agiWorkforce.autoApplyFixes',
  inlineCompletionsEnabled: 'agiWorkforce.inlineCompletions.enabled',
  inlineCompletionsDebounceMs: 'agiWorkforce.inlineCompletions.debounceMs',
  inlineCompletionsMaxLength: 'agiWorkforce.inlineCompletions.maxLength',
  model: 'agiWorkforce.model',
  composerFollowUpBehavior: 'agiWorkforce.composer.followUpBehavior',
  contextLines: 'agiWorkforce.contextLines',
  telemetryEnabled: 'agiWorkforce.telemetryEnabled',
  telemetryEndpoint: 'agiWorkforce.telemetryEndpoint',
  desktopBridgeEnabled: 'agiWorkforce.desktopBridge.enabled',
  desktopBridgePort: 'agiWorkforce.desktopBridge.port',
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

  it('exposes every active mutable extension option in the branded settings panel', () => {
    const activeMutableKeys = Object.entries(pkgSettings)
      .filter(
        ([, setting]) => setting.readOnly !== true && setting.deprecationMessage === undefined,
      )
      .map(([key]) => key.replace(/^agiWorkforce\./u, ''))
      .sort();

    expect([...SETTINGS_PANEL_SETTING_KEYS].sort()).toEqual(activeMutableKeys);
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

  it('does not publish retired transport or unsupported extension MCP controls', () => {
    expect(pkgSettings['agiWorkforce.streamingEnabled']).toBeUndefined();
    expect(pkgSettings['agiWorkforce.useProviderStream']).toBeUndefined();
    expect(pkgSettings['agiWorkforce.gatewayUrl']).toBeUndefined();
    expect(pkgSettings['agiWorkforce.mcp.enabled']).toBeUndefined();
  });

  it('restricts only settings that the extension actually contributes', () => {
    const restricted =
      readPackageJson().capabilities?.untrustedWorkspaces?.restrictedConfigurations ?? [];

    expect(restricted.length).toBeGreaterThan(0);
    expect(restricted.filter((key) => pkgSettings[key] === undefined)).toEqual([]);
  });

  it('restricts workspace settings that can change the model or Desktop bridge boundary', () => {
    const restricted =
      readPackageJson().capabilities?.untrustedWorkspaces?.restrictedConfigurations ?? [];

    expect(restricted).toEqual(
      expect.arrayContaining([
        'agiWorkforce.model',
        'agiWorkforce.desktopBridge.enabled',
        'agiWorkforce.desktopBridge.port',
      ]),
    );
  });

  it('presents the legacy invite command id as sign-in, not a private-beta gate', () => {
    const command = readPackageJson().contributes?.commands?.find(
      (entry) => entry.command === 'agi-workforce.openInviteCodeModal',
    );

    expect(command?.title).toBe('AGI Workforce: Sign In to AGI Cloud');
  });
});
