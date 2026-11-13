import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule1 = typeof import('./chat-attachment-hydration');
type ScanModule2 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule3 = typeof import('@/lib/server/user-identity');
type ScanModule4 = typeof import('@/lib/services/managed-usage-request-service');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

import { CreditService } from '@/lib/services/credit-service';
import { CLARIFY_TOOL_NAME } from '@/lib/services/clarify-tool-service';
import type { AuthGateSuccess } from './auth-gate';
import { toCanonicalChatRequest } from './canonical-request';
import {
  applyAnswerUiCapability,
  processRequest,
  TURN_INSTRUCTIONS_HEADING,
} from './request-processor';
import { ANSWER_UI_TOOL_NAME } from '@agiworkforce/types';
import { withheldToolsTurnNotice } from './turn-tool-offer';
import { EMPTY_ASSISTANT_TURN_HISTORY_TEXT } from '@/features/chat/lib/assistant-history-turn';

const DISABLED_POLICY = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const CARD_KINDS = [
  'answer-ui.v1',
  'clarify.v1',
  'map-search.v1',
  'itinerary.v1',
  'product-comparison.v1',
];

type ChatTurnMessage = { role: 'user' | 'assistant'; content: string };

function chatRequest(
  key: string,
  surface: string,
  message: string | ChatTurnMessage[],
): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': surface,
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: typeof message === 'string' ? [{ role: 'user', content: message }] : message,
      stream: true,
      x_interactive_cards: { supported: CARD_KINDS, canRespond: true },
    }),
  });
}

function auth(overrides: Partial<AuthGateSuccess> = {}): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
    boundSurface: 'web',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'surface-binding',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

const SHORT_QUESTION = 'Help me pick a name.';
const SUMMARY_REQUEST =
  'Summarize the following note: the team met on Tuesday and agreed to move the launch.';

describe.each(['chrome', 'web', 'mobile'] as const)(
  'the server tool list on the %s surface',
  (surface) => {
    async function turn(key: string, message: string | ChatTurnMessage[]) {
      const result = await processRequest(
        chatRequest(`${surface}-${key}`, surface, message),
        auth({ boundSurface: surface }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('request was refused');
      expect(result.chatSurface).toBe(surface);
      return result;
    }

    it('serializes the same tools for a short question and a summarize request', async () => {
      const question = await turn('stable-1', SHORT_QUESTION);
      const summary = await turn('stable-2', SUMMARY_REQUEST);

      const names = (question.llmRequest.tools ?? []).map(
        (tool) => (tool as { function?: { name?: string } }).function?.name,
      );
      expect(names).toContain(CLARIFY_TOOL_NAME);
      expect(names).toContain(ANSWER_UI_TOOL_NAME);
      expect(JSON.stringify(summary.llmRequest.tools)).toBe(
        JSON.stringify(question.llmRequest.tools),
      );
    });

    it('never sends a tool-only assistant turn as an empty message the next turn re-answers', async () => {
      const placeholder = String.fromCharCode(0x200b);
      for (const empty of ['', placeholder]) {
        const result = await turn(`empty-${empty.length}`, [
          { role: 'user', content: 'find 3 coffee shops near Union Square and show them on a map' },
          { role: 'assistant', content: empty },
          { role: 'user', content: 'what is 17 times 23' },
        ]);
        const assistant = result.llmRequest.messages.find((m) => m.role === 'assistant');
        expect(assistant?.content).toBe(EMPTY_ASSISTANT_TURN_HISTORY_TEXT);
      }
    });

    it('tells the model to keep a withheld tool out of the answer', async () => {
      const result = await turn('withheld-1', 'what is 17 times 23');
      expect(result.turnWithheldTools ?? []).not.toHaveLength(0);
      const wire = JSON.stringify(toCanonicalChatRequest(result).messages.at(-1));
      expect(wire).toContain('do not mention');
      expect(wire).toContain('without quoting or describing them to the user');
    });

    it('keeps system, tools and history byte-identical when the per-turn notice changes', async () => {
      const history: ChatTurnMessage[] = [
        { role: 'user', content: 'Which language is the repo in?' },
        { role: 'assistant', content: 'TypeScript and Rust.' },
      ];
      const question = await turn('notice-1', [
        ...history,
        { role: 'user', content: SHORT_QUESTION },
      ]);
      const summary = await turn('notice-2', [
        ...history,
        { role: 'user', content: SUMMARY_REQUEST },
      ]);

      expect(summary.turnWithheldTools).toContain(CLARIFY_TOOL_NAME);
      expect(summary.turnWithheldTools ?? []).not.toContain(ANSWER_UI_TOOL_NAME);
      expect(question.turnWithheldTools ?? []).not.toContain(ANSWER_UI_TOOL_NAME);
      expect(question.turnWithheldTools ?? []).not.toContain(CLARIFY_TOOL_NAME);

      const questionWire = toCanonicalChatRequest(question);
      const summaryWire = toCanonicalChatRequest(summary);
      const prefix = (wire: typeof questionWire) =>
        JSON.stringify({ tools: wire.tools, messages: wire.messages.slice(0, -1) });
      expect(prefix(summaryWire)).toBe(prefix(questionWire));

      const notice = withheldToolsTurnNotice(summary.turnWithheldTools ?? [])!;
      expect(prefix(summaryWire)).not.toContain(notice);
      const last = JSON.stringify(summaryWire.messages.at(-1));
      expect(last.indexOf(SUMMARY_REQUEST)).toBeGreaterThan(-1);
      expect(last.indexOf(notice)).toBeGreaterThan(last.indexOf(SUMMARY_REQUEST));
      expect(last).toContain(TURN_INSTRUCTIONS_HEADING);
    });
  },
);

describe('the answer UI tool offer', () => {
  function request(supported: string[] | undefined, stream = true) {
    return {
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user' as const, content: 'What is 17 times 23?' }],
      stream,
      ...(supported ? { x_interactive_cards: { supported, canRespond: true } } : {}),
    };
  }

  it('is offered only to a client that declares it can render answer UI', () => {
    const declared = request(['answer-ui.v1']);
    expect(applyAnswerUiCapability(declared as never, { toolsCapable: true })).toBe(true);
    expect(
      (declared as { tools?: Array<{ function: { name: string } }> }).tools?.map(
        (tool) => tool.function.name,
      ),
    ).toEqual([ANSWER_UI_TOOL_NAME]);

    for (const undeclared of [request(undefined), request(['clarify.v1', 'map-search.v1'])]) {
      expect(applyAnswerUiCapability(undeclared as never, { toolsCapable: true })).toBe(false);
      expect((undeclared as { tools?: unknown[] }).tools).toBeUndefined();
    }
  });

  it('is not offered to a model without tools or a request that does not stream', () => {
    expect(
      applyAnswerUiCapability(request(['answer-ui.v1']) as never, { toolsCapable: false }),
    ).toBe(false);
    expect(
      applyAnswerUiCapability(request(['answer-ui.v1'], false) as never, { toolsCapable: true }),
    ).toBe(false);
  });
});
