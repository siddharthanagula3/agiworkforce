import { describe, expect, it } from 'vitest';
import {
  BROWSER_CDP_COMMANDS,
  BROWSER_COMMANDS,
  BROWSER_COMMAND_PROTOCOL_VERSION,
  NATIVE_MESSAGING_HOST_NAME,
  PAIR_CODE_ALPHABET,
  extensionIdFromLaunchOrigin,
  isBrowserCommand,
  isBrowserCommandRequest,
  isBrowserCommandResult,
  isValidExtensionId,
  isValidPairCode,
  normalizePairCode,
} from '../browser-bridge';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('browser bridge contract', () => {
  it('keeps the host name the Rust host and the extension already agree on', () => {
    expect(NATIVE_MESSAGING_HOST_NAME).toBe('com.agiworkforce.browser');
  });

  it('names the command family the desktop may send', () => {
    expect(BROWSER_COMMANDS).toEqual([
      'browser_read_page',
      'browser_click',
      'browser_type',
      'browser_navigate',
      'browser_screenshot',
      'browser_console',
      'browser_network',
      'browser_download',
    ]);
    expect(BROWSER_COMMANDS.every(isBrowserCommand)).toBe(true);
    expect(isBrowserCommand('shell_run')).toBe(false);
  });

  it('classifies only the debugger-backed reads as CDP work', () => {
    expect([...BROWSER_CDP_COMMANDS]).toEqual(['browser_console', 'browser_network']);
  });

  it('excludes the letters a pairing code could be misread as', () => {
    for (const character of 'IO01') {
      expect(PAIR_CODE_ALPHABET).not.toContain(character);
    }
    expect(isValidPairCode('ABCDEFGI')).toBe(false);
    expect(isValidPairCode('ABC')).toBe(false);
    expect(normalizePairCode('ab-cd efgh')).toBe('ABCDEFGH');
    expect(isValidPairCode('ab-cd efgh')).toBe(true);
  });

  it('accepts only a Chrome extension id', () => {
    expect(isValidExtensionId(EXTENSION_ID)).toBe(true);
    expect(isValidExtensionId(EXTENSION_ID.toUpperCase())).toBe(false);
    expect(isValidExtensionId('short')).toBe(false);
  });

  it('reads the extension out of the launch origin and refuses anything else', () => {
    expect(extensionIdFromLaunchOrigin(`chrome-extension://${EXTENSION_ID}/`)).toBe(EXTENSION_ID);
    expect(extensionIdFromLaunchOrigin(`chrome-extension://${EXTENSION_ID}/page.html`)).toBeNull();
    expect(extensionIdFromLaunchOrigin('https://evil.example/')).toBeNull();
    expect(extensionIdFromLaunchOrigin(undefined)).toBeNull();
  });

  it('refuses a request or result from another protocol version', () => {
    const request = {
      version: BROWSER_COMMAND_PROTOCOL_VERSION,
      id: 'one',
      command: 'browser_click' as const,
      args: { selector: 'a' },
    };
    expect(isBrowserCommandRequest(request)).toBe(true);
    expect(isBrowserCommandRequest({ ...request, version: 2 })).toBe(false);
    expect(isBrowserCommandRequest({ ...request, command: 'browser_evaluate' })).toBe(false);

    const result = { version: BROWSER_COMMAND_PROTOCOL_VERSION, id: 'one', ok: true };
    expect(isBrowserCommandResult(result)).toBe(true);
    expect(isBrowserCommandResult({ ...result, version: 0 })).toBe(false);
    expect(isBrowserCommandResult({ id: 'one', ok: true })).toBe(false);
  });
});
