import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
} from '@agiworkforce/cloud-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { platformRequestHeaders } from '../src/platformHeaders';

const chromeGlobal = globalThis as { chrome?: unknown };

function installManifest(manifest: unknown) {
  chromeGlobal.chrome = { runtime: { getManifest: () => manifest } };
}

afterEach(() => {
  delete chromeGlobal.chrome;
  vi.restoreAllMocks();
});

describe('what every call from the extension tells the platform', () => {
  it('takes the version from the installed manifest, never from a literal', () => {
    installManifest({ version: '1.2.0' });

    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('chrome');
    expect(headers[CLIENT_VERSION_HEADER]).toBe('1.2.0');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });

  it('follows the manifest when a release bumps it', () => {
    installManifest({ version: '9.9.9' });
    expect(platformRequestHeaders()[CLIENT_VERSION_HEADER]).toBe('9.9.9');
  });

  it('still names the surface and the contract where no manifest is readable', () => {
    chromeGlobal.chrome = { runtime: {} };

    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('chrome');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
  });

  it('answers outside an extension page rather than taking the request down with it', () => {
    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('chrome');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
  });
});
