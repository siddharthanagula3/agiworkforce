import { readFileSync } from 'fs';
import path from 'path';

describe('Integrations deep-link capability honesty', () => {
  it('keeps device permissions visible but hides every Messaging control while Messaging is off', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'app', '(app)', 'settings', 'integrations.tsx'),
      'utf8',
    );

    expect(source).toContain('{FEATURES.messaging && (');
    expect(source).toMatch(
      /\{FEATURES\.messaging && \(\s*<View>\s*<SectionHeader\s+title="Messaging"/s,
    );
    expect(source).toContain('{FEATURES.messaging && selectedLegacyPlatform && (');
    expect(source).toContain('<SectionHeader title="Device"');
    expect(source).toContain('<SectionHeader title="Permissions"');
  });
});
