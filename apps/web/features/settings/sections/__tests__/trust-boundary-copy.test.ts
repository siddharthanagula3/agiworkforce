import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const privacy = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);
const byokPage = readFileSync(join(process.cwd(), 'app/settings/byok/page.tsx'), 'utf8');

// Local, BYOK and Managed Cloud are separate trust boundaries. Describing the
// first two on a WEB settings screen without saying they are not web invites a
// user to believe this browser can keep a conversation on-device.
describe('privacy copy names the surface each trust boundary applies to', () => {
  it('scopes Local Mode and BYOK to the surfaces that have them', () => {
    expect(privacy).toMatch(/On Desktop, CLI and VS Code/);
  });

  it('says plainly that hosted web has neither', () => {
    expect(privacy).toMatch(/Hosted Web has neither mode/);
    expect(privacy).toMatch(/everything you send here is a Managed Cloud request/);
  });

  it('agrees with the BYOK settings page rather than contradicting it', () => {
    // The BYOK page is the authority: hosted web stores no user provider keys.
    expect(byokPage).toMatch(/Hosted AGI Web\s*\n?\s*does not store user provider keys/);
  });

  it('does not describe Local or BYOK unscoped anywhere in the section', () => {
    const code = privacy.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code).not.toMatch(/All Local Mode conversations stay on your device/);
  });
});
