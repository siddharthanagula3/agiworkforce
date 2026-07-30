import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getAndroidAssetLinks } from './assetlinks.json/route';
import { GET as getAppleAppSiteAssociation } from './apple-app-site-association/route';

const FINGERPRINT_A = 'AA'.repeat(32);
const FINGERPRINT_B = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0'))
  .join(':')
  .toUpperCase();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mobile app domain association', () => {
  it('serves the production iOS application identifier and only supported paths', async () => {
    const response = getAppleAppSiteAssociation();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(body).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ['D2PR62RLT4.com.agiworkforce.app'],
            components: [
              expect.objectContaining({ '/': '/pair' }),
              expect.objectContaining({ '/': '/pair/*' }),
              expect.objectContaining({ '/': '/auth/reset-password' }),
            ],
          },
        ],
      },
    });
  });

  it('fails closed when the Android signing fingerprint is absent', async () => {
    vi.stubEnv('ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS', '');

    const response = getAndroidAssetLinks();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      error: 'android_app_links_not_configured',
    });
  });

  it('normalizes, deduplicates, and serves configured Android signing fingerprints', async () => {
    vi.stubEnv(
      'ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS',
      `${FINGERPRINT_A},\n${FINGERPRINT_B},${FINGERPRINT_A}`,
    );

    const response = getAndroidAssetLinks();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.agiworkforce.app',
          sha256_cert_fingerprints: [
            'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA',
            FINGERPRINT_B,
          ],
        },
      },
    ]);
  });

  it('rejects the complete Android association when any configured fingerprint is invalid', () => {
    vi.stubEnv('ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS', `${FINGERPRINT_A},not-a-certificate`);

    expect(getAndroidAssetLinks().status).toBe(503);
  });
});
