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
import { __CONFIG_DEFAULTS } from '../utils/config';

interface PkgConfigContrib {
  type: string;
  default?: unknown;
  description?: string;
}

function readPkgConfigSettings(): Record<string, PkgConfigContrib> {
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    contributes?: { configuration?: { properties?: Record<string, PkgConfigContrib> } };
  };
  return pkg.contributes?.configuration?.properties ?? {};
}

/** Map from DEFAULTS key → package.json `agiWorkforce.<x>` setting key. */
const KEY_MAP: Record<keyof typeof __CONFIG_DEFAULTS, string> = {
  agentMaxIterations: 'agiWorkforce.agent.maxIterations',
  agentPlanMode: 'agiWorkforce.agent.planMode',
  codeLensEnabled: 'agiWorkforce.codeLensEnabled',
  inlineCompletionsEnabled: 'agiWorkforce.inlineCompletions.enabled',
  inlineCompletionsDebounceMs: 'agiWorkforce.inlineCompletions.debounceMs',
  inlineCompletionsMaxLength: 'agiWorkforce.inlineCompletions.maxLength',
  mcpEnabled: 'agiWorkforce.mcp.enabled',
  model: 'agiWorkforce.model',
  streamingEnabled: 'agiWorkforce.streamingEnabled',
  contextLines: 'agiWorkforce.contextLines',
  fallbackToVscodeLm: 'agiWorkforce.fallbackToVscodeLm',
  telemetryEnabled: 'agiWorkforce.telemetryEnabled',
  telemetryEndpoint: 'agiWorkforce.telemetryEndpoint',
  useProviderStream: 'agiWorkforce.useProviderStream',
  providerStreamProvider: 'agiWorkforce.providerStreamProvider',
  desktopBridgeEnabled: 'agiWorkforce.desktopBridge.enabled',
  desktopBridgePort: 'agiWorkforce.desktopBridge.port',
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
});
