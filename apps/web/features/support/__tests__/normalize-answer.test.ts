import { describe, expect, it } from 'vitest';
import {
  isSafeCitationUrl,
  makeAbstention,
  normalizeAnswer,
  normalizeCitations,
} from '../lib/normalize-answer';

const CITED = {
  kind: 'answer',
  text: 'Add your provider key in Settings, then pick the model.',
  citations: [{ id: 'c1', title: 'Bring your own key', url: '/byok', snippet: 'Add a key…' }],
  proposedActionId: null,
};

describe('normalizeAnswer, the citation invariant', () => {
  it('passes a cited answer through as an answer', () => {
    const result = normalizeAnswer(CITED);
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') throw new Error('expected an answer');
    expect(result.text).toContain('Settings');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.url).toBe('/byok');
  });

  it('turns an answer with zero citations into an abstention and DROPS the prose', () => {
    const result = normalizeAnswer({ ...CITED, citations: [] });
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') throw new Error('expected an abstention');
    expect(result.reason).toBe('no_source');
    expect(result.escalationOffered).toBe(true);
    expect(result.text).not.toContain('Settings');
  });

  it('turns an answer whose citations are all unusable into an abstention', () => {
    const result = normalizeAnswer({
      ...CITED,
      citations: [
        { title: 'No url' },
        { title: 'Script', url: 'javascript:alert(1)' },
        { title: 'Offsite', url: '//evil.example/docs' },
      ],
    });
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') throw new Error('expected an abstention');
    expect(result.reason).toBe('no_source');
  });

  it('treats an unrecognised payload as an abstention, never as a blank answer', () => {
    for (const payload of [null, undefined, 'nope', 42, [], { kind: 'something-else' }, {}]) {
      const result = normalizeAnswer(payload);
      expect(result.kind).toBe('abstention');
      if (result.kind !== 'abstention') throw new Error('expected an abstention');
      expect(result.reason).toBe('unrecognized_response');
      expect(result.escalationOffered).toBe(true);
      expect(result.text.length).toBeGreaterThan(0);
    }
  });

  it('keeps hard-abstain reasons and their authoritative links', () => {
    const result = normalizeAnswer({
      kind: 'abstention',
      reason: 'hard_abstain_billing',
      text: 'A person handles billing.',
      authoritativeLinks: [
        { title: 'Pricing', url: '/pricing' },
        { title: 'Refund policy', url: '/refund-policy' },
      ],
    });
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') throw new Error('expected an abstention');
    expect(result.reason).toBe('hard_abstain_billing');
    expect(result.citations.map((c) => c.url)).toEqual(['/pricing', '/refund-policy']);
  });

  it('maps an unknown abstention reason to unrecognized_response rather than trusting it', () => {
    const result = normalizeAnswer({ kind: 'abstention', reason: 'made_up', text: 'hm' });
    if (result.kind !== 'abstention') throw new Error('expected an abstention');
    expect(result.reason).toBe('unrecognized_response');
  });

  it('rejects a model-supplied action id that is not a plain identifier', () => {
    const result = normalizeAnswer({ ...CITED, proposedActionId: '../../admin/delete' });
    if (result.kind !== 'answer') throw new Error('expected an answer');
    expect(result.proposedActionId).toBeNull();
  });

  it('keeps a well-formed action id', () => {
    const result = normalizeAnswer({ ...CITED, proposedActionId: 'revoke_connector' });
    if (result.kind !== 'answer') throw new Error('expected an answer');
    expect(result.proposedActionId).toBe('revoke_connector');
  });
});

describe('citation normalization', () => {
  it('accepts both the answer-engine and account-builder field spellings', () => {
    const citations = normalizeCitations([
      { title: 'Docs', url: '/docs' },
      { label: 'Your account, Plan', href: '/settings/billing' },
    ]);
    expect(citations.map((c) => c.title)).toEqual(['Docs', 'Your account, Plan']);
    expect(citations.map((c) => c.url)).toEqual(['/docs', '/settings/billing']);
  });

  it('de-duplicates by url', () => {
    const citations = normalizeCitations([
      { title: 'Docs', url: '/docs' },
      { title: 'Docs again', url: '/docs' },
    ]);
    expect(citations).toHaveLength(1);
  });
});

describe('isSafeCitationUrl', () => {
  it.each([
    ['/byok', true],
    ['/docs/byok-env#keys', true],
    ['https://agiworkforce.com/help', true],
    ['http://localhost:3000/help', true],
    ['//evil.example/docs', false],
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['data:text/html,<script>', false],
    ['vbscript:msgbox', false],
    ['mailto:someone@example.com', false],
    ['', false],
    ['   ', false],
    ['docs/relative', false],
  ])('%s → %s', (url, expected) => {
    expect(isSafeCitationUrl(url)).toBe(expected);
  });

  it('refuses scheme obfuscation with control and zero-width characters', () => {
    expect(isSafeCitationUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeCitationUrl('javascript​:alert(1)')).toBe(false);
    expect(isSafeCitationUrl('/docs‮/evil')).toBe(false);
  });
});

describe('makeAbstention', () => {
  it('always offers escalation and always has text', () => {
    const result = makeAbstention('model_unavailable');
    expect(result.escalationOffered).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
