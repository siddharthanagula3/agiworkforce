import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(__dirname, '..', 'app');
const layout = readFileSync(join(appDir, '_layout.tsx'), 'utf8');
const rootIndex = readFileSync(join(appDir, 'index.tsx'), 'utf8');

describe('the age gate guards every way into the app, Local Mode included', () => {
  it('sends the root index to the age gate before onboarding or the app', () => {
    const gate = rootIndex.indexOf(
      'if (!isAgeGateConfirmed(FEATURES.auth && accountAgeConfirmed))',
    );
    expect(gate).toBeGreaterThan(-1);
    expect(rootIndex.indexOf('pathname: AGE_GATE_PATH', gate)).toBeGreaterThan(gate);
    expect(gate).toBeLessThan(rootIndex.indexOf('pathname: ONBOARDING_PATH'));
    expect(gate).toBeLessThan(rootIndex.indexOf('pathname: APP_PATH'));
  });

  it('routes every root redirect through the shared resolver', () => {
    expect(layout).toContain('resolveRootRedirect({');
    expect(layout).not.toContain("'/(public)/age-gate'");
    expect(layout).not.toContain("'/(public)/onboarding'");
  });
});
