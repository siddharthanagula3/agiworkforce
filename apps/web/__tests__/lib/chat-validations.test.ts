import { describe, expect, it } from 'vitest';
import {
  CreateConversationSchema,
  CreateMessageSchema,
  UpdateConversationSchema,
} from '@/lib/validations/chat';

describe('chat model validation', () => {
  it('accepts Claude 4.6 models across chat schemas', () => {
    expect(
      CreateConversationSchema.parse({
        model: 'claude-sonnet-4.6',
      }).model,
    ).toBe('claude-sonnet-4.6');

    expect(
      CreateMessageSchema.parse({
        content: 'hello',
        model: 'claude-opus-4.6',
      }).model,
    ).toBe('claude-opus-4.6');

    expect(
      UpdateConversationSchema.parse({
        model: 'claude-opus-4.6',
      }).model,
    ).toBe('claude-opus-4.6');
  });
});
