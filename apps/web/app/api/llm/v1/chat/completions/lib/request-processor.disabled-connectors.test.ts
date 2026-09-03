import { describe, expect, it } from 'vitest';

import { ChatCompletionRequestSchema } from './request-processor';

describe('disabled_connector_ids request contract', () => {
  const base = { model: 'test-model', messages: [{ role: 'user', content: 'Hi' }] };

  it('is optional and defaults to undefined', () => {
    const result = ChatCompletionRequestSchema.parse(base);

    expect(result.disabled_connector_ids).toBeUndefined();
  });

  it('accepts a bounded list of connector ids', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      disabled_connector_ids: ['notion', 'custom-ab12cd34ef'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.disabled_connector_ids).toEqual(['notion', 'custom-ab12cd34ef']);
    }
  });

  it('rejects an empty connector id', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      disabled_connector_ids: [''],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more entries than any account could plausibly have connected', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      disabled_connector_ids: Array.from({ length: 65 }, (_, i) => `connector-${i}`),
    });

    expect(result.success).toBe(false);
  });
});
