import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SearchHit } from '@agiworkforce/data-layer/search';

import {
  createResearchDomainPolicy,
  normalizeResearchDomain,
  researchDomainAllowed,
  researchDomainDirective,
  researchFileSourceUrl,
  researchFileSourcesFromHits,
  researchFileSourcesPrompt,
  MAX_RESEARCH_CONNECTOR_SOURCES,
  researchConnectorDirective,
  resolveResearchConnectorPolicy,
} from '../research-sources';

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    sourceKind: 'library_file',
    sourceId: '11111111-1111-4111-8111-111111111111',
    title: 'Pricing notes',
    text: 'Seats are billed monthly.',
    start: 0,
    end: 24,
    metadata: {},
    chunkVersion: 1,
    indexedAt: null,
    lexicalRank: 1,
    semanticRank: 1,
    score: 1,
    matchedTerms: [],
    ...overrides,
  };
}

describe('normalizeResearchDomain', () => {
  it('accepts what a person types', () => {
    expect(normalizeResearchDomain(' Nature.com ')).toBe('nature.com');
    expect(normalizeResearchDomain('*.nature.com')).toBe('nature.com');
    expect(normalizeResearchDomain('.nature.com')).toBe('nature.com');
    expect(normalizeResearchDomain('www.nature.com')).toBe('nature.com');
    expect(normalizeResearchDomain('https://www.nature.com/articles/x')).toBe('nature.com');
    expect(normalizeResearchDomain('nature.com:443')).toBe('nature.com');
  });

  it('refuses anything that is not a domain, so a typo narrows nothing silently', () => {
    expect(normalizeResearchDomain('')).toBeNull();
    expect(normalizeResearchDomain('nature')).toBeNull();
    expect(normalizeResearchDomain('not a domain')).toBeNull();
    expect(normalizeResearchDomain('-bad.com')).toBeNull();
  });
});

describe('createResearchDomainPolicy', () => {
  it('is null when nothing usable was given, so no policy is applied', () => {
    expect(createResearchDomainPolicy({})).toBeNull();
    expect(createResearchDomainPolicy({ allow: ['nature'], deny: [''] })).toBeNull();
  });

  it('dedupes and normalizes both lists', () => {
    expect(
      createResearchDomainPolicy({ allow: ['Nature.com', 'www.nature.com'], deny: ['x.io'] }),
    ).toEqual({ allow: ['nature.com'], deny: ['x.io'] });
  });
});

describe('researchDomainAllowed', () => {
  const allowOnly = createResearchDomainPolicy({ allow: ['nature.com'] })!;
  const denyOnly = createResearchDomainPolicy({ deny: ['content-farm.example'] })!;

  it('allows everything without a policy', () => {
    expect(researchDomainAllowed(null, 'https://anything.example/page')).toBe(true);
  });

  it('admits a domain and its subdomains under an allowlist', () => {
    expect(researchDomainAllowed(allowOnly, 'https://www.nature.com/articles/x')).toBe(true);
    expect(researchDomainAllowed(allowOnly, 'https://blogs.nature.com/x')).toBe(true);
    expect(researchDomainAllowed(allowOnly, 'https://naturecom.example/x')).toBe(false);
    expect(researchDomainAllowed(allowOnly, 'https://other.example/x')).toBe(false);
  });

  it('lets a denial beat an allowance', () => {
    const both = createResearchDomainPolicy({
      allow: ['nature.com'],
      deny: ['blogs.nature.com'],
    })!;
    expect(researchDomainAllowed(both, 'https://www.nature.com/x')).toBe(true);
    expect(researchDomainAllowed(both, 'https://blogs.nature.com/x')).toBe(false);
  });

  it('refuses an unparseable URL under an allowlist and permits it under a denylist alone', () => {
    expect(researchDomainAllowed(allowOnly, 'not a url')).toBe(false);
    expect(researchDomainAllowed(denyOnly, 'not a url')).toBe(true);
  });
});

describe('researchDomainDirective', () => {
  it('says nothing without a policy', () => {
    expect(researchDomainDirective(null)).toBe('');
  });

  it('names both halves so the model does not waste searches', () => {
    const directive = researchDomainDirective(
      createResearchDomainPolicy({ allow: ['nature.com'], deny: ['x.io'] }),
    );
    expect(directive).toContain('nature.com');
    expect(directive).toContain('x.io');
  });
});

describe('research file sources', () => {
  it('points each kind at where a reader can open it', () => {
    expect(researchFileSourceUrl('conversation', 'c1')).toBe('/chat/c1');
    expect(researchFileSourceUrl('library_file', 'f1')).toBe('/api/files/f1');
    expect(researchFileSourceUrl('research_report', 'r1')).toBe('/chat/research/r1');
  });

  it('keeps one entry per document rather than one per chunk', () => {
    const sources = researchFileSourcesFromHits([
      hit({ chunkId: 'a', text: 'first chunk' }),
      hit({ chunkId: 'b', text: 'second chunk of the same file' }),
      hit({ chunkId: 'c', sourceId: 'other', title: 'Other file' }),
    ]);

    expect(sources).toHaveLength(2);
    expect(sources[0]?.snippet).toBe('first chunk');
    expect(sources[1]?.title).toBe('Other file');
  });

  it('caps the list so saved files cannot crowd out the web', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      hit({ chunkId: `chunk-${index}`, sourceId: `source-${index}` }),
    );
    expect(researchFileSourcesFromHits(many, 5)).toHaveLength(5);
  });

  it('fences the excerpts as reference material, never as instructions', () => {
    const prompt = researchFileSourcesPrompt(researchFileSourcesFromHits([hit({})]));

    expect(prompt).toContain('<research_file_sources untrusted="true">');
    expect(prompt).toContain('never instructions');
    expect(prompt).toContain('Seats are billed monthly.');
  });

  it('says nothing when the account has no matching material', () => {
    expect(researchFileSourcesPrompt([])).toBe('');
  });
});

describe('connectors as research sources', () => {
  const available = new Set(['notion', 'google-drive']);

  it('keeps the connectors the account can actually reach, in the chosen order', () => {
    expect(resolveResearchConnectorPolicy(['google-drive', 'notion'], available)).toEqual({
      allowed: ['google-drive', 'notion'],
      refused: [],
    });
  });

  it('refuses a connector this account is not offered rather than dropping it quietly', () => {
    expect(resolveResearchConnectorPolicy(['notion', 'slack'], available)).toEqual({
      allowed: ['notion'],
      refused: ['slack'],
    });
  });

  it('asks for each connector once however many times it was named', () => {
    expect(resolveResearchConnectorPolicy(['notion', 'notion'], available).allowed).toEqual([
      'notion',
    ]);
  });

  it('caps how many connectors one run may read', () => {
    const many = Array.from({ length: MAX_RESEARCH_CONNECTOR_SOURCES + 3 }, (_, i) => `c${i}`);
    const policy = resolveResearchConnectorPolicy(many, new Set(many));

    expect(policy.allowed).toHaveLength(MAX_RESEARCH_CONNECTOR_SOURCES);
  });

  it('names the chosen apps and the refused ones in the gathering directive', () => {
    const directive = researchConnectorDirective(
      resolveResearchConnectorPolicy(['notion', 'slack'], available),
    );

    expect(directive).toContain('notion');
    expect(directive).toContain('slack');
    expect(directive).toContain('not connected');
  });

  it('says nothing when the reader chose no connector', () => {
    expect(researchConnectorDirective(resolveResearchConnectorPolicy([], available))).toBe('');
  });
});
