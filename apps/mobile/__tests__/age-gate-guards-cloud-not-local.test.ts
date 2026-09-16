import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(__dirname, '..', 'app');
const layout = readFileSync(join(appDir, '_layout.tsx'), 'utf8');
const rootIndex = readFileSync(join(appDir, 'index.tsx'), 'utf8');

describe('age gate guards Cloud sign-in, not Local first launch', () => {
  it('does not gate the root redirect', () => {
    expect(rootIndex).not.toContain('age-gate');
    expect(rootIndex).not.toContain('isAgeGateConfirmed');
  });

  it('routes every root redirect through the shared resolver', () => {
    expect(layout).toContain('resolveRootRedirect({');
    expect(layout).not.toContain("'/(public)/age-gate'");
    expect(layout).not.toContain("'/(public)/onboarding'");
  });
});
