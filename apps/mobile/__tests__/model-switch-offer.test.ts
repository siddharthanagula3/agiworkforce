import { offersModelSwitch } from '../services/apiErrors';
import { getMessageStreamErrorCode } from '../src/features/chat/utils/messageStreamError';

describe('offersModelSwitch', () => {
  it('offers a switch for route and model failures', () => {
    for (const code of [
      'provider_billing_exhausted',
      'provider_overloaded',
      'provider_rate_limited',
      'provider_unreachable',
      'model_not_found',
      'empty_response',
      'context_length_exceeded',
      'content_filter',
    ]) {
      expect(offersModelSwitch(code)).toBe(true);
    }
  });

  it('keeps Retry alone when another model would not help', () => {
    for (const code of [
      'auth_required',
      'request_cancelled',
      'max_output_tokens_exceeded',
      'tool_call_invalid',
      'free_capacity_unavailable',
      'free_allowance_exhausted',
      '',
      null,
      undefined,
    ]) {
      expect(offersModelSwitch(code)).toBe(false);
    }
  });
});

describe('getMessageStreamErrorCode', () => {
  it('reads the code from an object stream error and nothing from a bare string', () => {
    expect(
      getMessageStreamErrorCode({
        metadata: { streamError: { message: 'unavailable', code: 'provider_overloaded' } },
      }),
    ).toBe('provider_overloaded');
    expect(getMessageStreamErrorCode({ metadata: { streamError: 'unavailable' } })).toBeUndefined();
    expect(getMessageStreamErrorCode({ metadata: {} })).toBeUndefined();
    expect(getMessageStreamErrorCode(null)).toBeUndefined();
  });
});
