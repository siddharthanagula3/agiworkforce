import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal()),
  buildServerProviderAdapter: () => ({ stream: mocks.stream }),
}));

import { getDefaultModelFor } from '@agiworkforce/types';

import { readGuestChatConfig } from '../config';
import {
  buildGuestChatRequest,
  guestChatModel,
  guestSpendKey,
  recordGuestSpend,
  streamGuestChat,
} from '../guest-chat-service';

async function* chunks(...items: unknown[]) {
  for (const item of items) yield item;
}

describe('guest chat', () => {
  beforeEach(() => mocks.stream.mockReset());

  it('uses the free plan’s default chat model from the registry', () => {
    const model = guestChatModel();

    expect(model.modelKey).toBe(getDefaultModelFor('free', 'chat'));
    expect(model.wireModel.length).toBeGreaterThan(0);
  });

  it('sends text only, with no tools, under the product identity and the output ceiling', () => {
    const config = readGuestChatConfig({});
    const request = buildGuestChatRequest(
      guestChatModel(),
      [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Tell me a fact' },
      ],
      config,
    );

    expect(request.tools).toBeUndefined();
    expect(request.maxOutputTokens).toBe(config.maxOutputTokens);
    expect(request.system).toContain('AGI Workforce');
    expect(request.messages).toHaveLength(3);
  });

  it('streams OpenAI chunks, ends with DONE and reports the usage', async () => {
    mocks.stream.mockReturnValue(
      chunks(
        { type: 'text-delta', delta: 'Hello' },
        { type: 'usage', inputTokens: 12, outputTokens: 3 },
        { type: 'stop', reason: 'end_turn' },
      ),
    );
    const onSettled = vi.fn(async () => undefined);
    const model = guestChatModel();

    const text = await new Response(
      streamGuestChat({
        model,
        chatRequest: buildGuestChatRequest(
          model,
          [{ role: 'user', content: 'Hi' }],
          readGuestChatConfig({}),
        ),
        signal: new AbortController().signal,
        onSettled,
      }),
    ).text();

    expect(text).toContain('"content":"Hello"');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(onSettled).toHaveBeenCalledWith({ inputTokens: 12, outputTokens: 3 });
  });

  it('counts nothing against the daily cap for a turn that cost nothing', async () => {
    const store = { increment: vi.fn(), expire: vi.fn() };
    const model = guestChatModel();

    const cost = await recordGuestSpend(
      store as never,
      model,
      { inputTokens: 0, outputTokens: 0 },
      new Date('2026-09-28T12:00:00Z'),
    );

    expect(cost).toBe(0);
    expect(store.increment).not.toHaveBeenCalled();
    expect(guestSpendKey(new Date('2026-09-28T12:00:00Z'))).toBe('guest-chat:spend:2026-09-28');
  });
});
