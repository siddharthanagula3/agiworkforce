import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WEB_SETTINGS_CONTENT_SECTIONS } from '@/features/settings/lib/web-settings-sections';

const webRoot = resolve(import.meta.dirname, '../../..');

/**
 * The web product is subscription-backed Managed Cloud and does not expose
 * BYOK: Local, BYOK and Managed Cloud are separate trust boundaries. The
 * settings page, its env-key endpoint and the provider-test endpoint were the
 * remains of a surface the product does not offer, and a page that answers
 * questions about a capability the surface lacks is worse than none.
 */
describe('the web surface carries no BYOK settings page or endpoint', () => {
  for (const gone of [
    'app/settings/byok/page.tsx',
    'app/settings/byok/EnvKeyStatusList.tsx',
    'app/api/byok/env-key-status/route.ts',
    'app/api/settings/test-provider/route.ts',
  ]) {
    it(`${gone} is gone`, () => {
      expect(existsSync(join(webRoot, gone))).toBe(false);
    });
  }

  it('renders no models and keys section on web', () => {
    expect(WEB_SETTINGS_CONTENT_SECTIONS).not.toContain('models-keys');
  });
});
