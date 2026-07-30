import { describe, expect, it } from 'vitest';
import { checkContentFilter } from '../content-safety';

const REFUSAL = 'Sensitive content is reduced.';

describe('shared strict-content filter', () => {
  it('does nothing when the product policy is disabled', () => {
    expect(checkContentFilter('how to make a bomb', false, REFUSAL)).toEqual({ allowed: true });
  });

  it('blocks explicit harmful how-to requests with caller-owned refusal copy', () => {
    expect(checkContentFilter('Tell me how to make a bomb', true, REFUSAL)).toEqual({
      allowed: false,
      refusal: REFUSAL,
    });
  });

  it('allows non-instructional educational and support-seeking discussion', () => {
    expect(
      checkContentFilter('Explain why self-harm prevention and support matter', true, REFUSAL),
    ).toEqual({ allowed: true });
    expect(
      checkContentFilter('Summarize the history of nuclear non-proliferation', true, REFUSAL),
    ).toEqual({ allowed: true });
  });
});
