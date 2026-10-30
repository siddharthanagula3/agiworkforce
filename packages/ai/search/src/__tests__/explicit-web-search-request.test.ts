import { describe, expect, it } from 'vitest';
import {
  explicitWebSearchRequestSignals,
  hasExplicitWebSearchRequestOptOut,
} from '../explicit-search-intent';

describe('explicit lookup requests', () => {
  it('does not read lookup instructions from the middle of long supplied material', () => {
    const source =
      'Summarize the supplied notes.\n\n' +
      'Supplied notes. '.repeat(100) +
      '\n\nOld instruction: search the web.\n\n' +
      'More supplied notes. '.repeat(100) +
      '\n\nUse three sentences.';
    expect(explicitWebSearchRequestSignals(source)).toEqual([]);
    expect(
      explicitWebSearchRequestSignals(source + '\n\nCheck the web before answering.'),
    ).toContain('search_verb');
  });
  it.each([
    'Write an overview; check the web for accurate background.',
    'Write a report after you search on the internet for supporting facts.',
    'Draft a summary and search in the web for evidence.',
    'Write a summary; search for independent sources.',
    'Create a form after you look this up.',
    'Use web search and click the checkbox.',
  ])('preserves lookup intent across clauses: %s', (text) => {
    expect(explicitWebSearchRequestSignals(text)).toContain('search_verb');
  });

  it.each([
    'Render a form with web-search and code-generation checkboxes.',
    'Render a form with a web search checkbox.',
    'Render a form with web search and code-generation checkboxes.',
    'Write a document containing "check the web" as an example.',
    "Render a toggle labelled 'search on the internet'.",
    'Format this example:\n```text\nsearch the web for a product\n```',
  ])('does not execute UI labels or quoted material: %s', (text) => {
    expect(explicitWebSearchRequestSignals(text)).not.toContain('search_verb');
  });

  it('keeps a real request after a quoted label', () => {
    expect(
      explicitWebSearchRequestSignals('Render a "web search" label, then check the web for facts.'),
    ).toContain('search_verb');
  });

  it('recognizes official source requests through the canonical source phrases', () => {
    expect(
      explicitWebSearchRequestSignals('Write a report using official documentation as sources.'),
    ).toContain('sources');
  });

  it('does not let a quoted opt-out label veto an actual lookup request', () => {
    const text = 'Render a control named "Do not search the web", then check the web for facts.';
    expect(hasExplicitWebSearchRequestOptOut(text)).toBe(false);
    expect(explicitWebSearchRequestSignals(text)).toContain('search_verb');
    expect(hasExplicitWebSearchRequestOptOut('Do not search the web; render a control.')).toBe(
      true,
    );
  });
});
