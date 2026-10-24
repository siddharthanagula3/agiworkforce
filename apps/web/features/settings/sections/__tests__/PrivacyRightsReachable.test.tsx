import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf-8');

/**
 * /privacy/requests carries the consent ledger and the rights-request form, and
 * was reachable only by typing the URL. A DPDP/GDPR rights path the data
 * subject cannot find from their own privacy settings is not a rights path.
 */
describe('privacy rights surface is reachable from settings', () => {
  it('still exists to link to', () => {
    expect(existsSync(join(WEB, 'app/privacy/requests/page.tsx'))).toBe(true);
    expect(existsSync(join(WEB, 'app/privacy/requests/RightsRequestForm.tsx'))).toBe(true);
    expect(existsSync(join(WEB, 'app/privacy/requests/ConsentCentre.tsx'))).toBe(true);
  });

  it('is linked from the Privacy settings section', () => {
    const section = read('features/settings/sections/PrivacySection.tsx');
    expect(section).toMatch(/href="\/privacy\/requests"/);
    expect(section).toMatch(/Privacy requests/);
  });
});
