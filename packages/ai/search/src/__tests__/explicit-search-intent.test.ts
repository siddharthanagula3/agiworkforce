import { describe, expect, it } from 'vitest';

import {
  EXPLICIT_SEARCH_INTENT_PHRASES,
  detectExplicitWebSearchIntent,
  hasExplicitWebFetchIntent,
  hasExplicitWebSearchOptOut,
  hasExplicitWebSearchIntent,
} from '../explicit-search-intent';

describe('detectExplicitWebSearchIntent', () => {
  it('reports the search-verb signal for a direct instruction to search', () => {
    expect(detectExplicitWebSearchIntent('Search the web for the Reuters top story')).toBe(
      'search_verb',
    );
    expect(detectExplicitWebSearchIntent('can you look this up for me')).toBe('search_verb');
    expect(detectExplicitWebSearchIntent('Look up the current CEO')).toBe('search_verb');
    expect(
      detectExplicitWebSearchIntent('Run two separate web searches for the official RFC pages'),
    ).toBe('search_verb');
  });

  it('reports the recency signal for a question that only current data answers', () => {
    expect(detectExplicitWebSearchIntent("what is today's exchange rate")).toBe('recency');
    expect(detectExplicitWebSearchIntent('give me the latest release notes')).toBe('recency');
    expect(detectExplicitWebSearchIntent('what is in the news about the merger')).toBe('recency');
  });

  it('reports the sources signal when the user asks for links or citations', () => {
    expect(detectExplicitWebSearchIntent('explain this and cite sources')).toBe('sources');
    expect(detectExplicitWebSearchIntent('summarise it with citations')).toBe('sources');
    expect(detectExplicitWebSearchIntent('answer and give me the link')).toBe('sources');
  });

  it('prefers the search verb when a turn carries more than one signal', () => {
    expect(detectExplicitWebSearchIntent('search the web for the latest, cite sources')).toBe(
      'search_verb',
    );
  });

  it('returns null for turns that ask for no outside information', () => {
    for (const text of [
      'write me a haiku about rain',
      'refactor this function to use a map',
      'why does my test fail with a TypeError',
      'translate the paragraph above into French',
      '',
    ]) {
      expect(detectExplicitWebSearchIntent(text)).toBeNull();
    }
  });

  it('does not fire on a phrase embedded inside a longer word', () => {
    expect(detectExplicitWebSearchIntent('the currently_running flag')).toBeNull();
    expect(detectExplicitWebSearchIntent('rename latestValue to newestValue')).toBeNull();
  });

  it('treats an explicit instruction not to search as a refusal, not a search request', () => {
    for (const text of [
      'Now reply exactly. Do not search the web or run code.',
      "Don't search online; answer from the conversation.",
      'Answer without web search, even if the subject is current.',
    ]) {
      expect(hasExplicitWebSearchOptOut(text)).toBe(true);
      expect(detectExplicitWebSearchIntent(text)).toBeNull();
    }
  });

  it('matches regardless of case and surrounding punctuation', () => {
    expect(hasExplicitWebSearchIntent('LOOK UP: the spec')).toBe(true);
    expect(hasExplicitWebSearchIntent('(today) what shipped?')).toBe(true);
  });

  it('matches every phrase it publishes', () => {
    for (const [signal, phrases] of Object.entries(EXPLICIT_SEARCH_INTENT_PHRASES)) {
      for (const phrase of phrases) {
        expect(hasExplicitWebSearchIntent(phrase)).toBe(true);
      }
      expect(phrases.length).toBeGreaterThan(0);
      expect(signal.length).toBeGreaterThan(0);
    }
  });
});

describe('hasExplicitWebFetchIntent', () => {
  it('requires a URL and a request to inspect its contents', () => {
    expect(hasExplicitWebFetchIntent('Summarize https://www.iana.org/help/example-domains')).toBe(
      true,
    );
    expect(
      hasExplicitWebFetchIntent('Open this URL: https://www.iana.org/help/example-domains'),
    ).toBe(true);
    expect(hasExplicitWebFetchIntent('A URL I remember is https://www.iana.org/')).toBe(false);
    expect(hasExplicitWebFetchIntent('Summarize this text, no link supplied.')).toBe(false);
  });

  it('does not fetch a URL when the user explicitly forbids opening it', () => {
    expect(
      hasExplicitWebFetchIntent('Do not open this URL: https://example.com. Summarize my note.'),
    ).toBe(false);
  });
});
