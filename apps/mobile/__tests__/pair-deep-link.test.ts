import fs from 'fs';
import path from 'path';

const rootLayoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

function pairingEffectSource(): string {
  const start = rootLayoutSource.indexOf('// C1: Deep linking');
  expect(start).toBeGreaterThan(-1);
  const end = rootLayoutSource.indexOf('isInitialized, router]);', start);
  expect(end).toBeGreaterThan(start);
  return rootLayoutSource.slice(start, end + 'isInitialized, router]);'.length);
}

describe('pairing deep-link handler, reachability', () => {
  it('gates on the real Clerk sign-in signal, not the always-null legacy session', () => {
    const effect = pairingEffectSource();
    expect(effect).toContain('if (!url || !isClerkSignedIn || !isInitialized) return;');
    expect(effect).not.toMatch(/!session\b/u);
  });

  it('re-runs when the sign-in signal changes, so a cold-launch link is not lost', () => {
    expect(pairingEffectSource()).toContain('}, [url, isClerkSignedIn, isInitialized, router]);');
  });

  it('no longer subscribes to the legacy session field anywhere in the layout', () => {
    expect(rootLayoutSource).not.toContain('useAuthStore((s) => s.session)');
  });
});
