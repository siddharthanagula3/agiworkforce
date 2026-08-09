/**
 * Regression: the desktop-pairing deep-link handler must be reachable.
 *
 * `app/_layout.tsx` gated the pairing effect on `useAuthStore.session`, which
 * `initialize()` never assigns — it is `null` for the whole life of the process
 * in v1 (see `src/features/auth/store.ts`, and the `#386` comments on the six
 * sibling effects that were already migrated). The guard therefore returned on
 * the first line for every URL, so an `agiworkforce://pair/CODE` tap and an
 * `https://agiworkforce.com/pair...` App Link / Universal Link tap — the two
 * routes the AASA and `app.config.js` claim — were silently dropped and the user
 * was never taken to the companion screen. QR scanning and manual code entry are
 * unaffected: the QR carries the gateway `agiw:<code>:<token>` payload read by
 * the in-app scanner, and manual entry uses the companion screen's own input.
 *
 * `Linking.parse()` needs a native module constant, so the handler body cannot
 * be driven from Jest. These are source assertions on the two properties that
 * made it dead: the gate expression and the effect's dependency list.
 */

import fs from 'fs';
import path from 'path';

const rootLayoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

/** The pairing effect, from its `// C1: Deep linking` banner to its closing deps array. */
function pairingEffectSource(): string {
  const start = rootLayoutSource.indexOf('// C1: Deep linking');
  expect(start).toBeGreaterThan(-1);
  const end = rootLayoutSource.indexOf('isInitialized, router]);', start);
  expect(end).toBeGreaterThan(start);
  return rootLayoutSource.slice(start, end + 'isInitialized, router]);'.length);
}

describe('pairing deep-link handler — reachability', () => {
  it('gates on the real Clerk sign-in signal, not the always-null legacy session', () => {
    const effect = pairingEffectSource();
    expect(effect).toContain('if (!url || !isClerkSignedIn || !isInitialized) return;');
    expect(effect).not.toMatch(/!session\b/u);
  });

  it('re-runs when the sign-in signal changes, so a cold-launch link is not lost', () => {
    // A link that launches the process arrives before Clerk resolves. If the
    // effect does not list the signal it depends on, it never re-runs once the
    // user is known and the launch URL is dropped.
    expect(pairingEffectSource()).toContain('}, [url, isClerkSignedIn, isInitialized, router]);');
  });

  it('no longer subscribes to the legacy session field anywhere in the layout', () => {
    expect(rootLayoutSource).not.toContain('useAuthStore((s) => s.session)');
  });
});
