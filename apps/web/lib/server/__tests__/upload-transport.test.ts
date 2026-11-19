import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { storageReachableForLargeFiles, uploadNeedsSameOriginRelay } from '../upload-transport';

const EXTENSION_ORIGIN = `chrome-extension://${'a'.repeat(32)}`;

function upload(url: string, origin?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: origin ? { origin } : {},
  });
}

const PREVIEW_ORIGIN = 'https://preview.example.test';

function browserGet(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: 'GET', headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('which uploads go through the web host', () => {
  it('relays a request with no Origin on a preview deployment, as before large files', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(
      uploadNeedsSameOriginRelay(upload('https://preview.example.test/api/uploads/presign')),
    ).toBe(true);
  });

  it('relays a request with no Origin on a local server reached by its network address, as before large files', () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(uploadNeedsSameOriginRelay(upload('http://192.168.1.20:3000/api/files/uploads'))).toBe(
      true,
    );
  });

  it('keeps a request with no Origin on the relay even when the storage CORS rule lists that host', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', PREVIEW_ORIGIN);
    expect(uploadNeedsSameOriginRelay(upload(`${PREVIEW_ORIGIN}/api/uploads/presign`))).toBe(true);
  });

  it('sends a request with no Origin straight to storage in production and on localhost:3000', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(uploadNeedsSameOriginRelay(upload('https://app.example.test/api/uploads/presign'))).toBe(
      false,
    );
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(uploadNeedsSameOriginRelay(upload('http://localhost:3000/api/uploads/presign'))).toBe(
      false,
    );
  });

  it('relays a browser page whose origin storage does not allow', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(
      uploadNeedsSameOriginRelay(
        upload('https://preview.example.test/api/uploads/presign', 'https://preview.example.test'),
      ),
    ).toBe(true);
  });

  it('relays the browser extension in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(
      uploadNeedsSameOriginRelay(
        upload('https://app.example.test/api/uploads/presign', EXTENSION_ORIGIN),
      ),
    ).toBe(true);
  });

  it('sends the production web page straight to storage', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(
      uploadNeedsSameOriginRelay(
        upload('https://app.example.test/api/uploads/presign', 'https://app.example.test'),
      ),
    ).toBe(false);
  });
});

describe('an origin the storage CORS rule lists', () => {
  it('sends a listed preview page straight to storage', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', `https://other.example.test, ${PREVIEW_ORIGIN}/`);
    expect(
      uploadNeedsSameOriginRelay(upload(`${PREVIEW_ORIGIN}/api/files/uploads`, PREVIEW_ORIGIN)),
    ).toBe(false);
  });

  it('still relays a preview page the list does not name', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', 'https://other.example.test');
    expect(
      uploadNeedsSameOriginRelay(upload(`${PREVIEW_ORIGIN}/api/files/uploads`, PREVIEW_ORIGIN)),
    ).toBe(true);
  });

  it.each([
    `${PREVIEW_ORIGIN}/path`,
    `${PREVIEW_ORIGIN}*`,
    `ftp://preview.example.test`,
    'preview.example.test',
    'https://*.example.test',
  ])('never widens an entry that is not a bare origin, such as %s, into a match', (entry) => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', entry);
    expect(
      uploadNeedsSameOriginRelay(upload(`${PREVIEW_ORIGIN}/api/files/uploads`, PREVIEW_ORIGIN)),
    ).toBe(true);
  });

  it('keeps relaying the browser extension even when its origin is listed', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', EXTENSION_ORIGIN);
    expect(
      uploadNeedsSameOriginRelay(
        upload('https://app.example.test/api/files/uploads', EXTENSION_ORIGIN),
      ),
    ).toBe(true);
  });
});

describe('whether a large file can reach storage from this caller', () => {
  it('judges a same-origin browser GET without an Origin by the page it came from', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(
      storageReachableForLargeFiles(
        browserGet(`${PREVIEW_ORIGIN}/api/me`, { 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(false);
  });

  it('refuses a preview page that sends its Origin', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(
      storageReachableForLargeFiles(
        browserGet(`${PREVIEW_ORIGIN}/api/me`, { origin: PREVIEW_ORIGIN }),
      ),
    ).toBe(false);
  });

  it('accepts a preview page the storage CORS rule lists, with or without an Origin', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', PREVIEW_ORIGIN);
    expect(
      storageReachableForLargeFiles(
        browserGet(`${PREVIEW_ORIGIN}/api/me`, { origin: PREVIEW_ORIGIN }),
      ),
    ).toBe(true);
    expect(
      storageReachableForLargeFiles(
        browserGet(`${PREVIEW_ORIGIN}/api/me`, { 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(true);
  });

  it('accepts a native client, which sends neither header', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(storageReachableForLargeFiles(browserGet(`${PREVIEW_ORIGIN}/api/me`, {}))).toBe(true);
  });

  it('accepts the production web page and refuses the extension there, as today', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(
      storageReachableForLargeFiles(
        browserGet('https://app.example.test/api/me', { 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(true);
    expect(
      storageReachableForLargeFiles(
        browserGet('https://app.example.test/api/me', { origin: EXTENSION_ORIGIN }),
      ),
    ).toBe(false);
  });
});
