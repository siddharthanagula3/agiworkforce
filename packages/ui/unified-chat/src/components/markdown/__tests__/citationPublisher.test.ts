import { describe, expect, it } from 'vitest';

import { citationPublisherDomain, isRoutingRedirectUrl } from '../citationPublisher';

const GROUNDING_REDIRECT =
  'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF8x2Kq';

/**
 * Observed live on 2026-09-08: a research turn returned four sources whose
 * cards correctly NAMED anthropic.com, claude.com and youtube.com while showing
 * vertexaisearch.cloud.google.com as the host of every one and drawing Google's
 * favicon for all of them. Grounded results do not arrive with the publisher's
 * URL; the publisher is in the title.
 */
describe('citationPublisherDomain', () => {
  it('uses the URL host for an ordinary citation', () => {
    expect(
      citationPublisherDomain({ url: 'https://www.anthropic.com/news/x', title: 'Some headline' }),
    ).toBe('anthropic.com');
  });

  it('uses the title when the URL belongs to the router rather than a publisher', () => {
    expect(citationPublisherDomain({ url: GROUNDING_REDIRECT, title: 'anthropic.com' })).toBe(
      'anthropic.com',
    );
  });

  it('prefers an explicit site name over the title', () => {
    expect(
      citationPublisherDomain({
        url: GROUNDING_REDIRECT,
        title: 'anthropic.com',
        siteName: 'claude.com',
      }),
    ).toBe('claude.com');
  });

  it('does not print prose where a host belongs', () => {
    // A grounded title is usually a domain, but not always. Showing a sentence
    // in the host slot is a different wrong answer to the same question.
    expect(
      citationPublisherDomain({ url: GROUNDING_REDIRECT, title: 'Claude Opus release notes' }),
    ).toBe('vertexaisearch.cloud.google.com');
  });

  it('falls back to the redirect host when there is no title at all', () => {
    expect(citationPublisherDomain({ url: GROUNDING_REDIRECT })).toBe(
      'vertexaisearch.cloud.google.com',
    );
  });

  it('never overrides a real publisher with its own title', () => {
    // The title path applies only to a router host. A publisher whose title
    // happens to be a domain keeps its own URL host.
    expect(
      citationPublisherDomain({ url: 'https://example.org/post', title: 'attacker.test' }),
    ).toBe('example.org');
  });

  it('returns null for a URL it cannot parse and no usable title', () => {
    expect(citationPublisherDomain({ url: 'not a url' })).toBeNull();
  });

  it('strips a www prefix on both paths', () => {
    expect(citationPublisherDomain({ url: 'https://www.example.org/x' })).toBe('example.org');
    expect(citationPublisherDomain({ url: GROUNDING_REDIRECT, title: 'www.example.org' })).toBe(
      'example.org',
    );
  });
});

describe('isRoutingRedirectUrl', () => {
  it('recognises the grounding redirect', () => {
    expect(isRoutingRedirectUrl(GROUNDING_REDIRECT)).toBe(true);
  });

  it.each([
    ['a publisher', 'https://anthropic.com/news'],
    ['a lookalike subdomain', 'https://vertexaisearch.cloud.google.com.attacker.test/x'],
    ['a host merely containing the name', 'https://my-vertexaisearch.example.test/x'],
    ['garbage', 'not a url'],
  ])('does not treat %s as a router', (_label, url) => {
    expect(isRoutingRedirectUrl(url)).toBe(false);
  });
});
