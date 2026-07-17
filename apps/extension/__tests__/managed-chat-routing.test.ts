import { describe, expect, it } from 'vitest';
import { resolveChromeManagedChatRoute } from '../src/features/cloud-bridge/managedChatRouting';

describe('Chrome Managed Cloud routing', () => {
  it('resolves Auto through the Chrome managed-chat profile', () => {
    const decision = resolveChromeManagedChatRoute({
      selection: 'auto',
      text: 'Summarize the key points in this page.',
      subscriptionTier: 'free',
      history: [],
    });

    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(decision.modelKey).toBeTruthy();
      expect(decision.harnessId).not.toBe('ollama/chat');
    }
  });

  it('preserves a still-eligible route for cache continuity', () => {
    const first = resolveChromeManagedChatRoute({
      selection: 'auto',
      text: 'Explain this article.',
      subscriptionTier: 'free',
      history: [],
    });
    expect(first.status).toBe('selected');
    if (first.status !== 'selected') return;

    const next = resolveChromeManagedChatRoute({
      selection: 'auto',
      text: 'Now make that explanation shorter.',
      subscriptionTier: 'free',
      history: [{ role: 'user', content: 'Explain this article.' }],
      currentModelKey: first.modelKey,
      previousTaskType: first.taskType,
    });

    expect(next.status).toBe('selected');
    if (next.status === 'selected') expect(next.modelKey).toBe(first.modelKey);
  });

  it('routes image attachments only to a model admitted for multimodal input', () => {
    const decision = resolveChromeManagedChatRoute({
      selection: 'auto',
      text: 'What is shown here?',
      subscriptionTier: 'free',
      history: [],
      attachments: [{ mime: 'image/png', type: 'image' }],
    });

    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') expect(decision.taskType).toBe('multimodal');
  });

  it('fails closed for an unknown selection instead of crossing to Local or BYOK', () => {
    const decision = resolveChromeManagedChatRoute({
      selection: 'invented-provider/model',
      text: 'Hello',
      subscriptionTier: 'max',
      history: [],
    });

    expect(decision).toMatchObject({
      status: 'unavailable',
      code: 'unknown_selection',
    });
  });
});
