import { describe, expect, it } from 'vitest';

import {
  API_CONTRACT_VERSION,
  API_CONTRACT_VERSIONS,
  API_VERSION_REQUEST_HEADER,
  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
  SUPPORTED_API_CONTRACT_VERSIONS,
  SURFACE_REQUEST_HEADER,
  clientHandshakeHeaders,
} from '../client-handshake';
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
