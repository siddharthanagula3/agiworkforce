import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  chromeExtensionIdFromPublicKey,
  configureChromeManifest,
  resolveChromeBuildConfiguration,
  validateReleaseManifest,
} from '../scripts/manifest-config.mjs';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8'));
const VALID_CHROME_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5cGnbsCvSikskJTyhn/hqB8wtzGwhZDaa6PQTePWdmuxI7u2JR7dPuAcyOL8zYW8japmuv7P/SBJ/wr1CiFQAJIToFv3pbDbZDxrUy0ttLNpvZumZ/GPj/4kEMwlWV0PZIRHzF91Cm41O3iQUhctXifllGX5IMicNSwXj/I52fWAcHKLm7Ut6C/PP4s3RP26K/I+s4D9E8Q8PgVGmkgsxxwyxX0ct+N2tdDXVYhFiPSXyU3wPp1gyoD8FRzy+N+xEWNF/a/mm+TSjI3cxkNPL9jpY00IRy/gh7PywS3h5lNa8skhxy2OklT2k7br1xNBAMHJAZRKdmAf5z/1z12rxwIDAQAB';
const VALID_CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ';
const VALID_CHROME_EXTENSION_ID = 'bpokepadbideikgldoabhakaeglpkgdg';

describe('Chrome release manifest configuration', () => {
  it('allows one exact isolated local renderer while retaining packaged-script policy', () => {
    const manifest = configureChromeManifest(sourceManifest, {
      artifactSandboxOrigin: 'http://127.0.0.1:3002/',
      apiBaseUrl: 'http://localhost:3000',
    });
    expect(manifest.content_security_policy.extension_pages).toContain(
      "frame-src 'self' http://127.0.0.1:3002;",
    );
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self';");
    expect(manifest.content_security_policy.extension_pages).not.toContain('frame-src http:');
    expect(manifest.sandbox).toBeUndefined();
  });

  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://localhost:3002', 'http://localhost:3000'],
    ['http://127.0.0.1:3002', 'http://127.0.0.1:3000'],
    ['http://localhost:3002', 'https://agiworkforce.com'],
    ['https://attacker.invalid', 'http://localhost:3000'],
    ['http://attacker.invalid', 'http://localhost:3000'],
    ['http://localhost:3002/path', 'http://localhost:3000'],
    ['http://localhost:3002?value=x', 'http://localhost:3000'],
  ])('refuses unsafe renderer %s with API %s', (artifactSandboxOrigin, apiBaseUrl) => {
    expect(() =>
      configureChromeManifest(sourceManifest, { artifactSandboxOrigin, apiBaseUrl }),
    ).toThrow();
  });

  it('refuses a local artifact renderer in a release package', () => {
    expect(() =>
      validateReleaseManifest(sourceManifest, { artifactSandboxOrigin: 'http://localhost:3002' }),
    ).toThrow(/HTTPS/);
  });

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

  it('warns that a development sync host also needs an allowlisted extension ID', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    configureChromeManifest(sourceManifest, {
      clerkFrontendApi: 'https://development.clerk.accounts.dev',
      clerkSyncHost: 'http://localhost:3100',
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('allowed_origins for both development and production'),
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('will be rejected'));
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

  it('builds a first draft with production sign-in but without a key, only before the item exists', () => {
    const clerk = {
      clerkPublishableKey: VALID_CLERK_PUBLISHABLE_KEY,
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
    };
    const draft = configureChromeManifest(sourceManifest, clerk);
    const keyed = configureChromeManifest(sourceManifest, {
      ...clerk,
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    });

    expect(draft.key).toBeUndefined();
    expect(() => validateReleaseManifest(draft, clerk, { firstDraft: true })).not.toThrow();
    expect(() => validateReleaseManifest(draft, clerk)).toThrow(/CHROME_EXTENSION_PUBLIC_KEY/);
    expect(() => validateReleaseManifest(keyed, clerk, { firstDraft: true })).toThrow(
      /must not carry a manifest key/,
    );
    expect(() =>
      validateReleaseManifest(
        draft,
        { ...clerk, chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY },
        { firstDraft: true },
      ),
    ).toThrow(/store item already exists/);
    expect(() =>
      validateReleaseManifest(
        draft,
        { ...clerk, clerkPublishableKey: 'pk_test_not_live' },
        { firstDraft: true },
      ),
    ).toThrow(/valid live CLERK_PUBLISHABLE_KEY/);
  });

  it('refuses a public key that belongs to a different store item than CWS_EXTENSION_ID', () => {
    const configuration = {
      clerkPublishableKey: VALID_CLERK_PUBLISHABLE_KEY,
      clerkFrontendApi: 'https://clerk.agiworkforce.com',
      clerkSyncHost: 'https://clerk.agiworkforce.com',
      chromeExtensionPublicKey: VALID_CHROME_EXTENSION_PUBLIC_KEY,
    };
    const manifest = configureChromeManifest(sourceManifest, configuration);

    expect(chromeExtensionIdFromPublicKey(VALID_CHROME_EXTENSION_PUBLIC_KEY)).toBe(
      VALID_CHROME_EXTENSION_ID,
    );
    expect(() =>
      validateReleaseManifest(manifest, {
        ...configuration,
        chromeExtensionId: VALID_CHROME_EXTENSION_ID,
      }),
    ).not.toThrow();
    expect(() =>
      validateReleaseManifest(manifest, {
        ...configuration,
        chromeExtensionId: 'abcdefghijklmnopabcdefghijklmnop',
      }),
    ).toThrow(/belongs to extension bpokepadbideikgldoabhakaeglpkgdg/);
    expect(() =>
      validateReleaseManifest(
        configureChromeManifest(sourceManifest, { ...configuration, chromeExtensionPublicKey: '' }),
        {
          ...configuration,
          chromeExtensionPublicKey: '',
          chromeExtensionId: VALID_CHROME_EXTENSION_ID,
        },
        { firstDraft: true },
      ),
    ).toThrow(/store item already exists/);
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
