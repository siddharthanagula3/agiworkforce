import { describe, expect, it } from 'vitest';

import {
  addFallbackReasonHeader,
  describeFallbackReason,
  FALLBACK_REASON_HEADER,
  toFallbackReasonHeaderValue,
} from './chat-fallback-reason';

describe('telling the user their request was changed', () => {
  it('reports a model swap', () => {
    expect(
      toFallbackReasonHeaderValue({ usedFallback: true, fallbackReason: 'managed_failover' }),
    ).toBe('managed_failover');
  });

  it('stays silent for an ordinary turn', () => {
    expect(toFallbackReasonHeaderValue({ usedFallback: false })).toBeNull();
    expect(
      toFallbackReasonHeaderValue({ usedFallback: false, fallbackReason: 'managed_failover' }),
    ).toBeNull();
  });

  it('reports a research downgrade even though the model did not change', () => {
    // Deep Research silently became an ordinary web-search turn: the loop never
    // ran, no report was saved, and the only disclosure was an instruction
    // asking the model to mention it - which the observed turn did not do.
    expect(
      toFallbackReasonHeaderValue({
        usedFallback: false,
        fallbackReason: 'research_unsupported_model',
      }),
    ).toBe('research_unsupported_model');
  });

  it('puts the downgrade on the response headers', () => {
    const headers: Record<string, string> = {};
    addFallbackReasonHeader(headers, {
      usedFallback: false,
      fallbackReason: 'research_unsupported_model',
    });
    expect(headers[FALLBACK_REASON_HEADER]).toBe('research_unsupported_model');
  });

  it('explains the downgrade in the reader’s terms, naming the consequence', () => {
    expect(describeFallbackReason('research_unsupported_model', 'Current Model')).toBe(
      'Current Model cannot run Deep Research, so this reply used web search instead. No research report was saved.',
    );
    expect(describeFallbackReason('research_unsupported_model')).toMatch(/no research report/i);
  });

  it('says nothing when there is nothing to say', () => {
    expect(describeFallbackReason(null)).toBeNull();
    expect(describeFallbackReason('')).toBeNull();
  });
});
