import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  configureChromeManifest,
  validateReleaseManifest,
} from '../scripts/manifest-config.mjs';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8'));

describe('Chrome release manifest configuration', () => {
  it('injects only the configured Clerk origins and stable CRX public key', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: 'public-key-material',
    });

    expect(manifest.key).toBe('public-key-material');
    expect(manifest.host_permissions).toContain('https://clerk.agiworkforce.com/*');
    expect(manifest.host_permissions).not.toContain('https://*.clerk.com/*');
    expect(manifest.content_security_policy.extension_pages).toContain(
      'https://clerk.agiworkforce.com',
    );
  });

  it('rejects release packages without a live Clerk key, exact origins, or stable CRX key', () => {
    const manifest = configureChromeManifest(sourceManifest, {});

    expect(() =>
      validateReleaseManifest(manifest, {
        clerkPublishableKey: 'pk_test_not_live',
      }),
    ).toThrow(/CLERK_FRONTEND_API/i);
  });

  it('accepts a fully configured production manifest', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: 'public-key-material',
    });

    expect(() =>
      validateReleaseManifest(manifest, {
        clerkPublishableKey: 'pk_live_repo_contract',
        clerkFrontendApi: 'https://clerk.agiworkforce.com',
        clerkSyncHost: 'https://clerk.agiworkforce.com',
        chromeExtensionPublicKey: 'public-key-material',
      }),
    ).not.toThrow();
  });
});
