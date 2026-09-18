import { describe, expect, it } from 'vitest';

import {
  addFallbackReasonHeader,
  describeFallbackReason,
  fallbackStepLabel,
  isSubstitution,
  FALLBACK_REASON_HEADER,
  toFallbackReasonHeaderValue,
  UNSPECIFIED_SUBSTITUTION_REASON,
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

describe('a substitution is never silent', () => {
  it('discloses a fallback whose cause nobody recorded', () => {
    expect(toFallbackReasonHeaderValue({ usedFallback: true })).toBe(
      UNSPECIFIED_SUBSTITUTION_REASON,
    );
    expect(toFallbackReasonHeaderValue({ usedFallback: true, fallbackReason: '   ' })).toBe(
      UNSPECIFIED_SUBSTITUTION_REASON,
    );
  });

  it('discloses a served model that is not the model the caller asked for', () => {
    expect(
      toFallbackReasonHeaderValue({
        requestedModel: 'fixture-requested-model',
        servedModel: 'fixture-served-model',
      }),
    ).toBe(UNSPECIFIED_SUBSTITUTION_REASON);
    const headers: Record<string, string> = {};
    addFallbackReasonHeader(headers, {
      requestedModel: 'fixture-requested-model',
      servedModel: 'fixture-served-model',
    });
    expect(headers[FALLBACK_REASON_HEADER]).toBe(UNSPECIFIED_SUBSTITUTION_REASON);
  });

  it('keeps quiet when the served model is the one that was asked for', () => {
    expect(
      toFallbackReasonHeaderValue({
        requestedModel: 'fixture-requested-model',
        servedModel: 'fixture-requested-model',
      }),
    ).toBeNull();
    expect(isSubstitution({ servedModel: 'fixture-served-model' })).toBe(false);
    expect(isSubstitution({ requestedModel: 'fixture-requested-model' })).toBe(false);
  });

  it('keeps a recorded cause rather than replacing it with the generic code', () => {
    expect(
      toFallbackReasonHeaderValue({
        usedFallback: true,
        fallbackReason: 'insufficient_credits',
        requestedModel: 'fixture-requested-model',
        servedModel: 'fixture-served-model',
      }),
    ).toBe('insufficient_credits');
  });

  it('reads the generic code back as an honest sentence', () => {
    expect(
      describeFallbackReason(UNSPECIFIED_SUBSTITUTION_REASON, 'Fixture Served Model'),
    ).toContain('Fixture Served Model');
    expect(describeFallbackReason(UNSPECIFIED_SUBSTITUTION_REASON)).toMatch(/was not recorded/i);
    expect(fallbackStepLabel(UNSPECIFIED_SUBSTITUTION_REASON, null)).toBe(
      'Switched to a different model',
    );
  });
});

describe('fallbackStepLabel', () => {
  it('names the model the router moved to', () => {
    expect(fallbackStepLabel('managed_failover', 'Fixture Backup Model')).toBe(
      'Switched to Fixture Backup Model',
    );
  });

  it('says a route changed when the model did not', () => {
    expect(fallbackStepLabel('openrouter_route_failover', 'Fixture Direct Model')).toBe(
      'Switched to a backup route for Fixture Direct Model',
    );
  });

  it('stays truthful when the serving model is not known yet', () => {
    expect(fallbackStepLabel('managed_failover', null)).toBe('Switched to a backup model');
  });

  it('has nothing to say when no fallback happened', () => {
    expect(fallbackStepLabel(null, 'Anything')).toBeNull();
    expect(fallbackStepLabel('   ', 'Anything')).toBeNull();
  });
});
