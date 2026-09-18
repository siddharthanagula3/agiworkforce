import fs from 'fs';
import path from 'path';

import { isAgiWorkforceUniversalLinkHost } from '@/src/integrations/universalLinks';

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

describe('pairing deep-link handler, authorization', () => {
  it('accepts only the AGI custom scheme on the exact pair host', () => {
    const effect = pairingEffectSource();
    expect(effect).toContain("scheme === 'agiworkforce' && hostname === 'pair'");
    expect(effect).toContain('if (!isCustomSchemePair && !isUniversalLinkPair) return;');
  });

  it('accepts a universal link only from a verified AGI host, never a lookalike', () => {
    const effect = pairingEffectSource();
    expect(effect).toContain('isAgiWorkforceUniversalLinkHost(hostname)');
    expect(effect).not.toMatch(/hostname\.(?:includes|endsWith|startsWith)\(/u);

    expect(isAgiWorkforceUniversalLinkHost('agiworkforce.com')).toBe(true);
    for (const lookalike of [
      'agiworkforce.com.attacker.example',
      'notagiworkforce.com',
      'agiworkforce.com.',
      'pair.agiworkforce.com',
      'agiworkforce.co',
    ]) {
      expect(isAgiWorkforceUniversalLinkHost(lookalike)).toBe(false);
    }
  });

  it('carries no account or conversation identifier, so the code is all the relay is given', () => {
    const effect = pairingEffectSource();
    expect(effect).toMatch(
      /PAIRING_CODE_RE\s*=\s*\/\^\[A-Za-z0-9\]\{12\}\$\|\^\[A-Za-z0-9\]\{8\}\$\//u,
    );
    expect(effect).toContain('if (!PAIRING_CODE_RE.test(code)) {');
    expect(effect).toMatch(/params: \{ pairingCode: code \}/u);
    expect(effect).not.toMatch(/userId|accountId|conversationId/u);
  });
});
