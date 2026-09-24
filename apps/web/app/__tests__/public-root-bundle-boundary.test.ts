import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '../..');
const REPO_DIR = path.resolve(WEB_DIR, '../..');

function source(relativePath: string): string {
  return readFileSync(path.join(REPO_DIR, relativePath), 'utf8');
}

describe('the public root stays separate from product-only bundles', () => {
  it('does not mount the product runtime from the root provider or layout', () => {
    const root = `${source('apps/web/app/layout.tsx')}\n${source('apps/web/app/providers.tsx')}`;

    expect(root).not.toContain('ProductRuntimeProviders');
    expect(root).not.toContain('AppRuntimeMounts');
    expect(root).not.toContain('CapabilityProvider');
    expect(root).not.toContain('SettingsModalProvider');
  });

  it('keeps request headers on the narrow cloud-contract entrypoint', () => {
    const csrf = source('apps/web/lib/client/csrf.ts');
    const manifest = JSON.parse(
      source('packages/contracts/cloud-contracts/package.json'),
    ) as { exports: Record<string, string> };

    expect(csrf).toContain("from '@agiworkforce/cloud-contracts/client-request'");
    expect(csrf).not.toMatch(/from '@agiworkforce\/cloud-contracts';/);
    expect(manifest.exports['./client-request']).toBe('./src/client-request.ts');
  });

  it('uses published UI subpaths in the always-loaded public shell', () => {
    const publicShell = [
      'apps/web/app/providers.tsx',
      'apps/web/app/error.tsx',
      'apps/web/shared/components/CookieConsent.tsx',
      'apps/web/features/marketing/components/system/MarketingMobileNav.tsx',
    ]
      .map(source)
      .join('\n');

    expect(publicShell).not.toMatch(/from '@agiworkforce\/ui';/);
  });
});
