import { readFileSync } from 'fs';
import path from 'path';

describe('Integrations deep-link capability honesty', () => {
  it('keeps device permissions without advertising the retired Messaging scaffold', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'app', '(app)', 'settings', 'integrations.tsx'),
      'utf8',
    );

    expect(source).not.toContain('FEATURES.messaging');
    expect(source).not.toContain('title="Messaging"');
    expect(source).not.toContain('features/messaging');
    expect(source).not.toContain('PlatformSetupSheet');
    expect(source).toContain('<SectionHeader title="Device"');
    expect(source).toContain('<SectionHeader title="Permissions"');
  });
});
