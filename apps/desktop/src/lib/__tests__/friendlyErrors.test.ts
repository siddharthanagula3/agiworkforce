import { describe, expect, it } from 'vitest';
import { formatErrorForChat, getFriendlyError } from '../friendlyErrors';

describe('friendlyErrors provider compatibility guidance', () => {
  it('explains unsupported structured output settings from provider gateways', () => {
    const message = formatErrorForChat(
      'invalid_request_error: output_config: Extra inputs are not permitted',
      true,
    );

    expect(message).toContain('Model Setting Not Supported');
    expect(message).toContain('structured output');
    expect(message).toContain('different model');
  });

  it('explains unsupported thinking or effort settings without exposing raw API jargon', () => {
    const friendly = getFriendlyError(
      'API Error: 400 This model does not support the effort parameter',
    );

    expect(friendly).toMatchObject({
      title: 'Model Setting Not Supported',
      icon: 'warning',
    });
    expect(friendly.suggestion).toContain('Auto model routing');
  });

  it('explains unsupported response format and JSON schema gateway settings', () => {
    const friendly = getFriendlyError(
      '400 Bad Request: response_format json_schema is not supported for this model',
    );

    expect(friendly).toMatchObject({
      title: 'Model Setting Not Supported',
      icon: 'warning',
    });
    expect(friendly.suggestion).toContain('structured output');
  });

  it('preserves retry-after guidance for rate limited providers', () => {
    const friendly = getFriendlyError(
      'openai API error 429: Rate limit exceeded. Retry after 60 seconds.',
    );

    expect(friendly).toMatchObject({
      title: 'Slow Down',
      icon: 'warning',
    });
    expect(friendly.suggestion).toContain('60 seconds');
  });
});
