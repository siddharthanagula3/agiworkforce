import { describe, expect, it } from 'vitest';
import {
  buildProvenanceClaim,
  hasAiGeneratedMarker,
  injectAiGeneratedMetaTag,
  renderAiGeneratedMetaTag,
  serialiseClaim,
  wrapTextExportWithMarker,
} from '../index';

const FIXTURE_IMAGE_MODEL_ID = 'fixture-image-model';
const FIXTURE_TEXT_MODEL_ID = 'fixture-text-model';

describe('Article50Marker, buildProvenanceClaim', () => {
  it('builds a C2PA-style claim with the required Article 50(2) fields', () => {
    const claim = buildProvenanceClaim({
      kind: 'image',
      provider: 'google',
      model: FIXTURE_IMAGE_MODEL_ID,
      generatedAt: '2026-05-17T12:00:00.000Z',
      contentHashSha256: 'a'.repeat(64),
    });
    expect(claim.version).toBe(1);
    expect(claim.claim_generator).toBe('AGI');
    expect(claim.kind).toBe('image');
    expect(claim.provider).toBe('google');
    expect(claim.model).toBe(FIXTURE_IMAGE_MODEL_ID);
    expect(claim.generated_at).toBe('2026-05-17T12:00:00.000Z');
    expect(claim.content_hash_sha256).toBe('a'.repeat(64));
    expect(claim.signature).toBeNull();

    expect(claim.assertions).toHaveLength(1);
    expect(claim.assertions[0]?.label).toBe('c2pa.actions');
    expect(claim.assertions[0]?.action).toBe('c2pa.created:trainedAlgorithmicMedia');
  });

  it('serialises with sorted keys so signing service can sign-and-verify deterministically', () => {
    const claim = buildProvenanceClaim({
      kind: 'text',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    const serialised = serialiseClaim(claim);
    expect(typeof serialised).toBe('string');
    expect(serialised.indexOf('assertions')).toBeLessThan(serialised.indexOf('version'));
  });

  it('keeps nested assertion keys through serialisation', () => {
    const claim = buildProvenanceClaim({
      kind: 'text',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    const parsed = JSON.parse(serialiseClaim(claim)) as {
      assertions: Array<{ label?: string; action?: string }>;
    };
    expect(parsed.assertions).toHaveLength(1);
    expect(parsed.assertions[0]?.label).toBe('c2pa.actions');
    expect(parsed.assertions[0]?.action).toBe('c2pa.created:trainedAlgorithmicMedia');
  });

  it('sorts keys at every depth, not just the top level', () => {
    const claim = buildProvenanceClaim({
      kind: 'image',
      provider: 'google',
      model: FIXTURE_IMAGE_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    const serialised = serialiseClaim(claim);
    expect(serialised).toContain(
      '"assertions":[{"action":"c2pa.created:trainedAlgorithmicMedia","label":"c2pa.actions"}]',
    );
  });
});

describe('Article50Marker, <meta> tag', () => {
  it('renders the exact tag name the integration test grep-asserts', () => {
    const tag = renderAiGeneratedMetaTag({
      kind: 'image',
      provider: 'openai',
      model: FIXTURE_IMAGE_MODEL_ID,
      generatedAt: '2026-05-17T12:00:00.000Z',
    });
    expect(tag).toMatch(/<meta\s+name="agi:ai-generated"/);
    expect(tag).toContain('content="true"');
    expect(tag).toContain('data-kind="image"');
    expect(tag).toContain('data-provider="openai"');
    expect(tag).toContain(`data-model="${FIXTURE_IMAGE_MODEL_ID}"`);
    expect(tag).toContain('data-generated-at="2026-05-17T12:00:00.000Z"');
  });

  it('escapes hostile attribute values', () => {
    const tag = renderAiGeneratedMetaTag({
      kind: 'text',
      provider: 'evil"><script>alert(1)</script>',
      model: 'm',
    });
    expect(tag).not.toContain('<script>');
    expect(tag).toContain('&lt;script&gt;');
    expect(tag).toContain('&quot;');
  });

  it('injects into <head> and stays idempotent', () => {
    const html = '<html><head><title>x</title></head><body>hi</body></html>';
    const once = injectAiGeneratedMetaTag({
      html,
      kind: 'text',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(once.match(/<meta\s+name="agi:ai-generated"/gi)?.length).toBe(1);

    const twice = injectAiGeneratedMetaTag({
      html: once,
      kind: 'text',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(twice.match(/<meta\s+name="agi:ai-generated"/gi)?.length).toBe(1);
  });

  it('prepends the tag when no <head> exists', () => {
    const out = injectAiGeneratedMetaTag({
      html: '<body>plain</body>',
      kind: 'text',
      provider: 'p',
      model: 'm',
    });
    expect(out.indexOf('<meta name="agi:ai-generated"')).toBe(0);
  });
});

describe('Article50Marker, wrapTextExportWithMarker + hasAiGeneratedMarker', () => {
  it('wraps text with both the JSON sidecar and the meta tag', () => {
    const wrapped = wrapTextExportWithMarker({
      text: 'hello world',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(wrapped).toContain('<!-- agi:ai-generated:c2pa-claim');
    expect(wrapped).toContain('hello world');
    expect(wrapped).toMatch(/<meta\s+name="agi:ai-generated"/);
    expect(hasAiGeneratedMarker(wrapped)).toBe(true);
  });

  it('emits a sidecar whose claim still carries its Article 50(2) assertions', () => {
    const wrapped = wrapTextExportWithMarker({
      text: 'hello world',
      provider: 'anthropic',
      model: FIXTURE_TEXT_MODEL_ID,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    const sidecar = wrapped.match(/<!-- agi:ai-generated:c2pa-claim (.*?) -->/)?.[1];
    expect(sidecar).toBeDefined();
    const parsed = JSON.parse(sidecar as string) as {
      assertions: Array<{ action?: string }>;
    };
    expect(parsed.assertions.some((a) => a.action === 'c2pa.created:trainedAlgorithmicMedia')).toBe(
      true,
    );
  });

  it('returns false for plain payloads with no marker', () => {
    expect(hasAiGeneratedMarker('a totally human-written paragraph')).toBe(false);
    expect(hasAiGeneratedMarker('<meta name="description" content="hi">')).toBe(false);
  });
});
