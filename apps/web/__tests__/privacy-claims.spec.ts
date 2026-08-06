/**
 * FIX-008 regression test: Privacy Policy content assertions.
 *
 * These checks prevent accidental removal of legally-required disclosures.
 * The test reads the raw TSX source (not the rendered HTML) to assert that
 * the required terms appear in the document. TSX source is the authoritative
 * text — the rendered HTML contains the same strings.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Collapse whitespace before matching. These assertions substring-match raw TSX,
 * and Prettier wraps JSX text across lines — so "…via Google\n Analytics." made
 * a correct, published disclosure look absent. Four of these checks were failing
 * for that reason alone.
 */
function readNormalized(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8').replace(/\s+/g, ' ');
}

const privacySource = readNormalized('../app/privacy/page.tsx');

const termsSource = readNormalized('../app/terms/page.tsx');

describe('Privacy Policy required disclosures (FIX-008)', () => {
  it('discloses Sentry error reporting', () => {
    expect(privacySource).toContain('Sentry');
  });

  it('discloses Google Analytics', () => {
    // Google Analytics is real: shared/components/GoogleAnalytics.tsx loads
    // gtag.js behind the consent gate. Google Tag Manager is NOT — no container
    // is loaded anywhere — so it is deliberately not required here. Requiring it
    // is what kept a false vendor name in a compliance document.
    expect(privacySource).toContain('Google Analytics');
  });

  it('states data hosting region (United States)', () => {
    expect(privacySource).toContain('United States');
  });

  it('states EU residency status', () => {
    // Must mention EU or EEA and explicitly state availability / unavailability
    expect(privacySource.toLowerCase()).toMatch(/eu.*residen|eea|european/i);
  });

  it('provides GDPR data-subject rights section', () => {
    expect(privacySource).toMatch(/GDPR/);
  });

  it('provides CCPA rights section', () => {
    expect(privacySource).toMatch(/CCPA/);
  });

  it('provides data export instructions', () => {
    expect(privacySource).toMatch(/[Ee]xport/);
  });

  it('provides account deletion instructions', () => {
    expect(privacySource).toMatch(/[Dd]elete.*[Aa]ccount|[Aa]ccount.*[Dd]elete/);
  });

  it('names Stripe as billing processor', () => {
    expect(privacySource).toContain('Stripe');
  });

  it('names no AI provider that is absent from the model catalog', () => {
    // This replaces a "list at least N provider names" assertion, which was
    // actively harmful: it rewarded padding the list and was satisfied by Groq
    // and Mistral — two providers DELETED from the catalog (see the R26
    // canonicalization test in packages/contracts/types). A compliance document
    // naming a processor that processes nothing is a false disclosure, and the
    // test demanded it.
    //
    // The honest invariant is the opposite one: every provider named must exist.
    const retired = ['Groq', 'Mistral'];
    for (const name of retired) {
      expect(
        privacySource.includes(name),
        `${name} was removed from the model catalog and must not be disclosed as a processor`,
      ).toBe(false);
    }
  });

  it('names the managed-cloud providers that are actually reachable', () => {
    // Direct providers, per MANAGED_CLOUD_ORIGIN_PROVIDERS, plus OpenRouter,
    // through which aggregator-routing.ts sends MiniMax, Qwen and Zhipu.
    for (const name of ['Anthropic', 'OpenAI', 'Google', 'DeepSeek', 'Perplexity', 'OpenRouter']) {
      expect(
        privacySource,
        `${name} is in the managed prompt path and must be disclosed`,
      ).toContain(name);
    }
  });

  it('does not claim "no logging" of conversations', () => {
    // The old stub said "We do not store, log, or use your conversations" which
    // contradicts Cloud Mode sync. Ensure that exact phrasing is gone.
    expect(privacySource).not.toContain('We do not store, log, or use your conversations to train');
  });

  it('does not claim "zero server-side storage"', () => {
    expect(privacySource).not.toContain('zero server-side storage');
  });
});

describe('Terms of Service required clauses (FIX-035)', () => {
  it('includes warranty disclaimer', () => {
    expect(termsSource).toMatch(/AS IS|AS-IS/);
    expect(termsSource).toMatch(/[Ww]arranty/);
  });

  it('includes limitation of liability', () => {
    expect(termsSource).toMatch(/[Ll]imitation of [Ll]iability/);
  });

  it('includes governing law clause', () => {
    expect(termsSource).toMatch(/[Gg]overning [Ll]aw/);
  });

  it('includes arbitration clause', () => {
    expect(termsSource).toMatch(/[Aa]rbitration/);
  });

  it('includes auto-renewal disclosure (Stripe)', () => {
    expect(termsSource).toMatch(/[Aa]uto.?renew/);
    expect(termsSource).toContain('Stripe');
  });

  it('includes DPA / Data Processing Agreement reference', () => {
    expect(termsSource).toMatch(/DPA|Data Processing Agreement/);
  });

  it('includes termination clause', () => {
    expect(termsSource).toMatch(/[Tt]ermination/);
  });

  it('includes indemnification clause', () => {
    expect(termsSource).toMatch(/[Ii]ndemnif/);
  });
});
