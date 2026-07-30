import { describe, expect, it } from 'vitest';
import {
  SETTINGS_COMMANDS,
  parseSettingsWebviewMessage,
} from '../features/settings/settingsProtocol';
import type { MutableConfigValues } from '../platform/config';

const validValues: MutableConfigValues = {
  apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
  model: 'auto',
  cliPath: 'agi',
  streamingEnabled: true,
  contextLines: 50,
  telemetryEnabled: false,
  hoverEnabled: false,
  codeLensEnabled: false,
  autoApplyFixes: false,
  'inlineCompletions.enabled': false,
  'inlineCompletions.debounceMs': 300,
  'inlineCompletions.maxLength': 500,
  'agent.mode': 'auto',
  'agent.effort': 'medium',
  'agent.thinking': false,
  'mcp.enabled': false,
  'desktopBridge.enabled': false,
  'desktopBridge.port': 8787,
  telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
  useProviderStream: false,
  gatewayUrl: 'https://api.agiworkforce.com',
  tier: 'byok',
};

describe('settings webview protocol', () => {
  it('accepts every settings-panel key with its typed value', () => {
    for (const [key, value] of Object.entries(validValues)) {
      expect(parseSettingsWebviewMessage({ type: 'settings.update', key, value }), key).toEqual({
        type: 'settings.update',
        update: { key, value },
      });
    }
  });

  it('accepts only allowlisted host commands', () => {
    for (const command of SETTINGS_COMMANDS) {
      expect(parseSettingsWebviewMessage({ type: 'settings.command', command })).toEqual({
        type: 'settings.command',
        command,
      });
    }

    expect(
      parseSettingsWebviewMessage({
        type: 'settings.command',
        command: 'runArbitraryCommand',
      }),
    ).toBeUndefined();
  });

  it('rejects unknown keys, invalid ranges, and non-http endpoints', () => {
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.update',
        key: 'unknown',
        value: true,
      }),
    ).toBeUndefined();
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.update',
        key: 'desktopBridge.port',
        value: 22,
      }),
    ).toBeUndefined();
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.update',
        key: 'apiEndpoint',
        value: 'file:///tmp/credentials',
      }),
    ).toBeUndefined();
  });

  it('rejects extra properties instead of widening the protocol', () => {
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.ready',
        unexpected: true,
      }),
    ).toBeUndefined();
  });
});
