import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal()),
  buildServerProviderAdapter: () => ({ stream: mocks.stream }),
}));

import { modelRegistry } from '@agiworkforce/model-registry';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';
import { getDefaultModelFor, getModelMetadataById } from '@agiworkforce/types';

import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';

import { readGuestChatConfig } from '../config';
import {
  buildGuestChatRequest,
  estimateGuestTurnMicrousd,
  guestChatModel,
  guestChatSystemPrompt,
  guestSpendKey,
  reserveGuestSpend,
  settleGuestSpend,
  streamGuestChat,
} from '../guest-chat-service';

const NAMES_AGI = /\bYou are AGI,/u;
const AGI_CLARIFIER = 'AGI is your name, not a claim to be artificial general intelligence.';
const NOW = new Date('2026-10-02T12:00:00.000Z');

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

  it('sends the pinned prompt with its identity rules, the missing tools and the time', () => {
    const sections = chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
    const identity = chatSystemPromptSection(sections, 'identity');
    const system = String(
      buildGuestChatRequest(
        guestChatModel(),
        [{ role: 'user', content: 'Are you artificial general intelligence?' }],
        readGuestChatConfig({}),
      ).system,
    );

    expect(system).toContain(identity);
    expect(system).toContain(chatSystemPromptSection(sections, 'no_tools'));
    expect(system).toContain('The current UTC date and time is');
    expect(system).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY.trim());
    expect(system.includes(AGI_CLARIFIER)).toBe(NAMES_AGI.test(identity));
  });

  it.each(
    CHAT_SYSTEM_PROMPT_VERSIONS.filter(({ sections }) =>
      NAMES_AGI.test(sections['identity'] ?? ''),
    ).map(({ version }) => version),
  )('says AGI is a name and names the model the app picked at version %i', (version) => {
    const model = guestChatModel();
    const metadata = getModelMetadataById(model.modelKey);
    if (!metadata) throw new Error('the guest model is not in the catalog');

    const system = guestChatSystemPrompt(model, {
      promptSelection: { variants: { [CHAT_SYSTEM_PROMPT_ID]: version } },
      now: NOW,
    });

    expect(system).toContain(AGI_CLARIFIER);
    expect(system).toContain('never claim to be human');
    expect(system).toContain("never present yourself as another AI company's assistant");
    expect(system).toContain(metadata.name);
    expect(system).not.toContain('Which model serves this turn is not stated here');
    expect(system).not.toContain('which the user selected');
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

  it('names one spend key per day for all guests', () => {
    expect(guestSpendKey(new Date('2026-09-28T12:00:00Z'))).toBe('guest-chat:spend:2026-09-28');
  });
});

describe('guest spend caps', () => {
  const NOW = new Date('2026-09-28T12:00:00Z');
  const CAPS = {
    deviceSpendMicrousdPerDay: 1_000,
    ipSpendMicrousdPerDay: 3_000,
    globalSpendMicrousdPerDay: 10_000,
  };

  function memoryStore() {
    const values = new Map<string, number>();
    return {
      values,
      increment: vi.fn(async (key: string, amount = 1) => {
        const next = (values.get(key) ?? 0) + amount;
        values.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => undefined),
    };
  }

  function reserve(
    store: ReturnType<typeof memoryStore>,
    amountMicrousd: number,
    visitorId = 'visitor-1',
    networkId = 'ip:203.0.113.9',
  ) {
    return reserveGuestSpend({
      store: store as never,
      now: NOW,
      visitorId,
      networkId,
      amountMicrousd,
      config: CAPS,
    });
  }

  it('ships defaults that keep a guest below what a Free account is funded', () => {
    const config = readGuestChatConfig({});
    expect(config.deviceSpendMicrousdPerDay).toBeLessThan(config.ipSpendMicrousdPerDay);
    expect(config.ipSpendMicrousdPerDay).toBeLessThan(config.globalSpendMicrousdPerDay);
    expect(config.globalSpendMicrousdPerDay).toBeLessThan(20_000_000);
  });

  it('holds a turn against the device, the network and every guest together', async () => {
    const store = memoryStore();

    const admission = await reserve(store, 400);

    expect(admission).toEqual({
      ok: true,
      hold: {
        keys: [
          'guest-chat:spend:2026-09-28',
          'guest-chat:spend:ip:ip:203.0.113.9:2026-09-28',
          'guest-chat:spend:device:visitor-1:2026-09-28',
        ],
        reservedMicrousd: 400,
      },
    });
    expect([...store.values.values()]).toEqual([400, 400, 400]);
  });

  it('refuses a device past its daily cap and gives back what it held', async () => {
    const store = memoryStore();
    await reserve(store, 800);

    const refused = await reserve(store, 300);

    expect(refused).toEqual({ ok: false, limit: 'device' });
    expect([...store.values.values()]).toEqual([800, 800, 800]);
  });

  it('caps a network that rotates devices', async () => {
    const store = memoryStore();
    for (const visitor of ['a', 'b', 'c']) {
      expect((await reserve(store, 1_000, visitor)).ok).toBe(true);
    }

    expect(await reserve(store, 1_000, 'd')).toEqual({ ok: false, limit: 'ip' });
  });

  it('caps every guest together, whatever device or network they use', async () => {
    const store = memoryStore();
    for (let index = 0; index < 10; index += 1) {
      expect((await reserve(store, 1_000, `visitor-${index}`, `ip:${index}`)).ok).toBe(true);
    }

    expect(await reserve(store, 1_000, 'visitor-x', 'ip:x')).toEqual({
      ok: false,
      limit: 'global',
    });
  });

  it('prices the most a turn can cost from its input and the output ceiling', () => {
    const [routeId, route] = Object.entries(
      modelRegistry.routes as unknown as Record<
        string,
        { modelKey: string; provider: string; pricing: { inputPerMillion?: number } }
      >,
    ).find(([, candidate]) => (candidate.pricing.inputPerMillion ?? 0) > 0)!;
    const model = {
      ...guestChatModel(),
      modelKey: route.modelKey,
      provider: route.provider,
      routeId,
    };
    const config = readGuestChatConfig({});
    const short = estimateGuestTurnMicrousd(
      model,
      buildGuestChatRequest(model, [{ role: 'user', content: 'Hi' }], config),
      NOW,
    );
    const long = estimateGuestTurnMicrousd(
      model,
      buildGuestChatRequest(model, [{ role: 'user', content: 'word '.repeat(5_000) }], config),
      NOW,
    );

    expect(long).toBeGreaterThan(short);
  });

  it('settles a hold to what the turn cost, and keeps it whole when usage never came', async () => {
    const store = memoryStore();
    const model = guestChatModel();
    const admission = await reserve(store, 900);
    if (!admission.ok) throw new Error('expected a hold');

    const kept = await settleGuestSpend({
      store: store as never,
      hold: admission.hold,
      model,
      usage: null,
      now: NOW,
    });
    expect(kept).toBe(900);
    expect([...store.values.values()]).toEqual([900, 900, 900]);

    const settled = await settleGuestSpend({
      store: store as never,
      hold: admission.hold,
      model,
      usage: { inputTokens: 0, outputTokens: 0 },
      now: NOW,
    });
    expect(settled).toBe(0);
    expect([...store.values.values()]).toEqual([0, 0, 0]);
  });
});
