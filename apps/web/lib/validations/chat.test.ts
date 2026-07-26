import { describe, expect, it } from 'vitest';
import { CreateConversationSchema, CreateMessageSchema } from './chat';

describe('chat model validation', () => {
  it('accepts an image model for an assistant image-generation message', () => {
    const result = CreateMessageSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      role: 'assistant',
      content: '\u200B',
      model: 'gpt-image-2',
      metadata: {
        toolType: 'image-generation',
        imageUrl: '/api/files/00000000-0000-4000-8000-000000000002',
      },
      skipLlm: true,
    });

    expect(result.success).toBe(true);
  });

  it('does not allow an image-only model to become the conversation model', () => {
    expect(
      CreateConversationSchema.safeParse({
        title: 'Image chat',
        model: 'gpt-image-2',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown message models', () => {
    expect(
      CreateMessageSchema.safeParse({
        role: 'assistant',
        content: '\u200B',
        model: 'made-up-image-model',
      }).success,
    ).toBe(false);
  });
});
