import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const privacy = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);
const capabilities = readFileSync(
  join(process.cwd(), 'features/settings/sections/CapabilitiesSection.tsx'),
  'utf8',
);

// Local, BYOK and Managed Cloud are separate trust boundaries. Describing the
// first two on a WEB settings screen without saying they are not web invites a
// user to believe this browser can keep a conversation on-device.
describe('privacy copy names the surface each trust boundary applies to', () => {
  it('scopes Local Mode and BYOK to the surfaces that have them', () => {
    expect(privacy).toMatch(/In the CLI, Local Mode conversations/);
    expect(privacy).toMatch(/VS Code BYOK is coming soon/);
  });

  it('says plainly that hosted web has neither', () => {
    expect(privacy).toMatch(/Hosted Web and Desktop have neither mode/);
    expect(privacy).toMatch(/everything you send there is a Managed Cloud\s+request/);
  });

  it('says the same thing where a reader asks about their own provider keys', () => {
    // The BYOK settings page was deleted with the rest of the web BYOK surface,
    // so this section is where the question now gets its answer.
    expect(capabilities).toMatch(/available in the CLI/);
    expect(capabilities).toMatch(/VS Code support is coming\s+soon/);
    expect(capabilities).toMatch(/Hosted Web and Desktop are Managed Cloud only/);
    expect(capabilities).toMatch(/never store a provider key of yours/);
    expect(capabilities).not.toMatch(/\/settings\/byok/);
  });

  it('does not describe Local or BYOK unscoped anywhere in the section', () => {
    const code = privacy.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code).not.toMatch(/All Local Mode conversations stay on your device/);
  });
});
