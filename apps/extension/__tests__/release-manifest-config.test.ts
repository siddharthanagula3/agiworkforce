import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  configureChromeManifest,
  resolveChromeBuildConfiguration,
  validateReleaseManifest,
} from '../scripts/manifest-config.mjs';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8'));
const VALID_CHROME_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5cGnbsCvSikskJTyhn/hqB8wtzGwhZDaa6PQTePWdmuxI7u2JR7dPuAcyOL8zYW8japmuv7P/SBJ/wr1CiFQAJIToFv3pbDbZDxrUy0ttLNpvZumZ/GPj/4kEMwlWV0PZIRHzF91Cm41O3iQUhctXifllGX5IMicNSwXj/I52fWAcHKLm7Ut6C/PP4s3RP26K/I+s4D9E8Q8PgVGmkgsxxwyxX0ct+N2tdDXVYhFiPSXyU3wPp1gyoD8FRzy+N+xEWNF/a/mm+TSjI3cxkNPL9jpY00IRy/gh7PywS3h5lNa8skhxy2OklT2k7br1xNBAMHJAZRKdmAf5z/1z12rxwIDAQAB';
const VALID_CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ';

describe('Chrome release manifest configuration', () => {
  it('lets explicit workflow configuration override empty Vite env values', () => {
    expect(
      resolveChromeBuildConfiguration(
        {
          CLERK_PUBLISHABLE_KEY: '',
          CLERK_SYNC_HOST: '',
        },
        {
          CLERK_PUBLISHABLE_KEY: 'pk_live_workflow_contract',
          CLERK_SYNC_HOST: 'https://workflow-clerk.invalid',
        },
      ),
    ).toMatchObject({
      clerkPublishableKey: 'pk_live_workflow_contract',
      clerkSyncHost: 'https://workflow-clerk.invalid',
    });
  });

  it('injects only the configured Clerk origins and stable CRX public key', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    });

    expect(manifest.key).toBe(VALID_CHROME_EXTENSION_PUBLIC_KEY);
    expect(manifest.host_permissions).toContain('https://clerk.agiworkforce.com/*');
    expect(manifest.host_permissions).not.toContain('https://*.clerk.com/*');
    expect(manifest.content_security_policy.extension_pages).toContain(
      'https://clerk.agiworkforce.com',
    );
  });

  it('rejects a non-empty key that Chrome cannot parse as public-key material', () => {
    expect(() =>
      configureChromeManifest(sourceManifest, {
        chromeExtensionPublicKey: 'ci-contract-public-key-not-for-release',
      }),
    ).toThrow(/base64 DER/i);
  });

  it('rejects release packages without a live Clerk key, exact origins, or stable CRX key', () => {
    const manifest = configureChromeManifest(sourceManifest, {});

    expect(() =>
      validateReleaseManifest(manifest, {
        clerkPublishableKey: 'pk_test_not_live',
      }),
    ).toThrow(/CLERK_FRONTEND_API/i);
  });

  it('rejects malformed or mismatched live Clerk publishable keys', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    });
    const configuration = {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    };

    expect(() =>
      validateReleaseManifest(manifest, {
        ...configuration,
        clerkPublishableKey: 'pk_live_ci_contract_fixture',
      }),
    ).toThrow(/valid live CLERK_PUBLISHABLE_KEY/i);
    expect(() =>
      validateReleaseManifest(manifest, {
        ...configuration,
        clerkPublishableKey: 'pk_live_Y2xlcmstb3RoZXIuaW52YWxpZCQ',
      }),
    ).toThrow(/configured CLERK_FRONTEND_API/i);
  });

  it('accepts a fully configured production manifest', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    });

    expect(() =>
      validateReleaseManifest(manifest, {
        clerkPublishableKey: VALID_CLERK_PUBLISHABLE_KEY,
        clerkFrontendApi: 'https://clerk.agiworkforce.com',
        clerkSyncHost: 'https://clerk.agiworkforce.com',
        chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
      }),
    ).not.toThrow();
  });
});
