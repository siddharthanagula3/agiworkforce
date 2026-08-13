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
  'composer.followUpBehavior': 'queue',
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
  'desktopBridge.enabled': false,
  'desktopBridge.port': 8787,
  telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
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

  it('accepts bounded host and workspace instruction updates only', () => {
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.instructions.update',
        scope: 'host',
        value: 'Prefer focused tests.',
      }),
    ).toEqual({
      type: 'settings.instructions.update',
      scope: 'host',
      value: 'Prefer focused tests.',
    });
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.instructions.update',
        scope: 'repository',
        value: 'not an allowed scope',
      }),
    ).toBeUndefined();
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.instructions.update',
        scope: 'workspace',
        value: 'x'.repeat(8_001),
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
