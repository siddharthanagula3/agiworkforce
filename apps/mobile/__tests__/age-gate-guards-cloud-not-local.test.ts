import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(__dirname, '..', 'app');
const layout = readFileSync(join(appDir, '_layout.tsx'), 'utf8');
const rootIndex = readFileSync(join(appDir, 'index.tsx'), 'utf8');

/**
 * The age gate guards Cloud, not the app. Local Mode sends nothing off the
 * device, so a gate in front of first launch protects no data subject and puts
 * a wall in front of a Local user, which _layout's locked Local-first rule
 * forbids. These tests pin that boundary: routing a Local user through the age
 * gate again should fail here rather than ship.
 */
describe('age gate guards Cloud sign-in, not Local first launch', () => {
  it('does not gate the root redirect', () => {
    expect(rootIndex).not.toContain('age-gate');
    expect(rootIndex).not.toContain('isAgeGateConfirmed');
  });

  it('sends a user with no onboarding straight to onboarding on the Local path', () => {
    const localBranch = layout.slice(
      layout.indexOf('if (!authEnabled) {'),
      layout.indexOf('if (!isClerkLoaded) return;'),
    );
    expect(localBranch).toContain("'/(public)/onboarding'");
    expect(localBranch).not.toContain('age-gate');
  });

  it('raises the gate when a signed-out user heads for Cloud sign-in', () => {
    expect(layout).toMatch(
      /if \(!isClerkSignedIn && inAuthGroup && !isAgeGateConfirmed\(\)\) \{\s*router\.replace\(\{\s*pathname: '\/\(public\)\/age-gate'/,
    );
  });

  it('returns the user to Cloud sign-in after confirming, not to onboarding', () => {
    expect(layout).toContain('CLOUD_SIGN_IN_RETURN_PATH');
  });

  it('keeps the gate on the signed-in Cloud paths', () => {
    const signedIn = layout.slice(layout.indexOf('} else if (isClerkSignedIn && inAuthGroup) {'));
    expect(signedIn).toContain('isAgeGateConfirmed()');
  });
});
