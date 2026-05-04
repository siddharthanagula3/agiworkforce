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

const privacySource = readFileSync(resolve(__dirname, '../app/privacy/page.tsx'), 'utf-8');

const termsSource = readFileSync(resolve(__dirname, '../app/terms/page.tsx'), 'utf-8');

// Minimum number of distinct AI provider names required in the privacy policy.
// Locked at 9 hosted providers per the cross-surface coherence sprint (privacy
// page rewrite, commit c924e4f6 — 9 hosted providers + Local LLM options).
const MIN_PROVIDER_COUNT = 9;

describe('Privacy Policy required disclosures (FIX-008)', () => {
  it('discloses Sentry error reporting', () => {
    expect(privacySource).toContain('Sentry');
  });

  it('discloses Google Analytics / Google Tag Manager', () => {
    expect(privacySource).toContain('Google Analytics');
    expect(privacySource).toContain('Google Tag Manager');
  });

  it('states Supabase data region (us-east-2)', () => {
    expect(privacySource).toContain('us-east-2');
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

  it(`lists at least ${MIN_PROVIDER_COUNT} distinct AI provider names`, () => {
    const providers = [
      'Anthropic',
      'OpenAI',
      'Google',
      'xAI',
      'DeepSeek',
      'Mistral',
      'Groq',
      'Together',
      'Fireworks',
      'Cerebras',
      'Cohere',
      'AI21',
      'SambaNova',
      'NVIDIA',
      'Azure',
      'Bedrock',
      'OpenRouter',
      'Ollama',
      'Perplexity',
      'Moonshot',
    ];
    const found = providers.filter((p) => privacySource.includes(p));
    expect(found.length).toBeGreaterThanOrEqual(MIN_PROVIDER_COUNT);
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
