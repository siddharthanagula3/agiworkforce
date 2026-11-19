import { describe, expect, it } from 'vitest';

import {
  API_CONTRACT_VERSION,
  API_CONTRACT_VERSIONS,
  API_VERSION_REQUEST_HEADER,
  LARGE_CHAT_FILES_CAPABILITY,
  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
  SUPPORTED_API_CONTRACT_VERSIONS,
  SURFACE_REQUEST_HEADER,
  clientHandshakeHeaders,
  hasClientCapability,
} from '../client-handshake';
import { CLIENT_CAPABILITIES_REQUEST_HEADER } from '../header-names';
import { CLIENT_VERSION_HEADER } from '../me';

describe('the handshake a surface sends', () => {
  it('names the surface, the build and the contract that build was written against', () => {
    const headers = clientHandshakeHeaders({ surface: 'chrome', version: '1.2.0' });

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('chrome');
    expect(headers[CLIENT_VERSION_HEADER]).toBe('1.2.0');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });

  it('omits the version rather than claiming one the build never stamped', () => {
    for (const version of [undefined, '', '   ']) {
      const headers = clientHandshakeHeaders({ surface: 'cli', version });
      expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
      expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    }
  });

  it('trims a version a build padded, so one series does not become two labels', () => {
    const headers = clientHandshakeHeaders({ surface: 'mobile', version: ' 1.2.0\n' });
    expect(headers[CLIENT_VERSION_HEADER]).toBe('1.2.0');
  });

  it("sends exactly today's headers when the caller names no capability", () => {
    for (const build of [
      { surface: 'web' as const, version: '1.2.0' },
      { surface: 'mobile' as const, version: undefined },
      { surface: 'web' as const, version: '1.2.0', capabilities: [] },
    ]) {
      const headers = clientHandshakeHeaders(build);
      expect(Object.keys(headers)).not.toContain(CLIENT_CAPABILITIES_REQUEST_HEADER);
      expect(headers).toStrictEqual({
        [SURFACE_REQUEST_HEADER]: build.surface,
        ...(build.version ? { [CLIENT_VERSION_HEADER]: build.version } : {}),
        [API_VERSION_REQUEST_HEADER]: API_CONTRACT_VERSION,
      });
    }
    expect(API_CONTRACT_VERSION).toBe('2026-09-17');
  });

  it('lists the capabilities a caller names, once each', () => {
    const headers = clientHandshakeHeaders({
      surface: 'web',
      version: '1.2.0',
      capabilities: [LARGE_CHAT_FILES_CAPABILITY, LARGE_CHAT_FILES_CAPABILITY],
    });
    expect(LARGE_CHAT_FILES_CAPABILITY).toBe('large-chat-files-v1');
    expect(headers[CLIENT_CAPABILITIES_REQUEST_HEADER]).toBe('large-chat-files-v1');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(
      hasClientCapability(headers[CLIENT_CAPABILITIES_REQUEST_HEADER], LARGE_CHAT_FILES_CAPABILITY),
    ).toBe(true);
  });
});

describe('reading the capabilities a client lists', () => {
  it('finds the token in a comma list, spaces and all', () => {
    for (const value of [
      'large-chat-files-v1',
      ' large-chat-files-v1 ',
      'other-v2, large-chat-files-v1',
      'large-chat-files-v1,other-v2',
      'a ,  large-chat-files-v1  , b',
    ]) {
      expect(hasClientCapability(value, LARGE_CHAT_FILES_CAPABILITY), value).toBe(true);
    }
  });

  it('refuses a missing header, an empty value and a token that only contains it', () => {
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      ',',
      'large-chat-files-v10',
      'large-chat-files-v1x',
      'xlarge-chat-files-v1',
      'large-chat-files',
      'large-chat-files-v1;q=1',
      'large-chat-files-v1-beta',
      'LARGE-CHAT-FILES-V1x',
    ]) {
      expect(hasClientCapability(value, LARGE_CHAT_FILES_CAPABILITY), String(value)).toBe(false);
    }
  });
});

describe('the contract this deployment serves', () => {
  it('still answers the oldest contract it declares a floor for', () => {
    expect(MINIMUM_SUPPORTED_API_CONTRACT_VERSION <= API_CONTRACT_VERSION).toBe(true);
  });

  it('refuses nothing a current build sends, because the floor is what it speaks', () => {
    expect(SUPPORTED_API_CONTRACT_VERSIONS.has(API_CONTRACT_VERSION)).toBe(true);
    expect(MINIMUM_SUPPORTED_API_CONTRACT_VERSION).toBe(API_CONTRACT_VERSION);
  });
});

describe('a contract bump does not strand installed builds', () => {
  it('serves the newest contract last in an ordered, duplicate-free list', () => {
    expect(API_CONTRACT_VERSIONS[API_CONTRACT_VERSIONS.length - 1]).toBe(API_CONTRACT_VERSION);
    expect([...API_CONTRACT_VERSIONS]).toEqual([...new Set(API_CONTRACT_VERSIONS)].sort());
  });

  it('keeps answering every listed contract from the floor up, and only those', () => {
    expect(API_CONTRACT_VERSIONS).toContain(MINIMUM_SUPPORTED_API_CONTRACT_VERSION);
    expect([...SUPPORTED_API_CONTRACT_VERSIONS].sort()).toEqual(
      API_CONTRACT_VERSIONS.filter((v) => v >= MINIMUM_SUPPORTED_API_CONTRACT_VERSION),
    );
  });
});
