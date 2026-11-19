import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { modelRegistry, getRoutePricing } from '@agiworkforce/model-registry';
import { getModelMetadataById } from '@agiworkforce/types';
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { OPEN_FILE_TOOL_NAME } from '@/lib/server/tools/file-search-tool';
import { withdrawnToolMessage } from './tool-turn-governor';
import {
  FILE_READING_REMOVED_STUB,
  LARGE_FILE_CARD_KEY,
  LARGE_FILE_PARTIAL_READ_LINE,
  applyAttachmentTurnStep,
  attachmentPartTokens,
  attachmentTurnTokenLimit,
  attachmentTurnTokenLimitForRoute,
  cardMarkerOf,
  createStepReadingBudget,
  estimateAttachmentTokens,
  fitTextSections,
  largeFileTextPart,
  renderLargeFileCard,
  textMarkerOf,
  type AttachmentTurnLedgerState,
  type LargeFileCardMarker,
  type LargeFileTextMarker,
  type LedgerMessage,
} from './attachment-turn-budget';

const POLICY = CHAT_LARGE_FILE_POLICY.turnBudget;
const OUT_OF_LEDGER_CEILING = 3_000;
const CENTS_PER_DOLLAR = 100;
const TOKENS_PER_MILLION = 1_000_000;

function assetId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function words(count: number, seed = 0): string {
  const vocabulary = [
    'harbor',
    'lantern',
    'meadow',
    'quartz',
    'falcon',
    'ember',
    'willow',
    'cobalt',
  ];
  return Array.from(
    { length: count },
    (_, index) => vocabulary[(index + seed) % vocabulary.length],
  ).join(' ');
}

function cardMarker(index: number, live = true): LargeFileCardMarker {
  const first = `[attached file: report-${index}.csv (text/csv), 30.0 MiB, id ${assetId(index)}]`;
  return {
    assetId: assetId(index),
    live,
    lines: [
      first,
      'Text read: 2,000,000 characters.',
      'Its text is searchable.',
      'When code runs, the file is placed in the code sandbox under /home/user.',
    ],
    oneLine: first,
    partial: false,
  };
}

function cardPart(marker: LargeFileCardMarker) {
  return {
    type: 'text',
    text: renderLargeFileCard(marker, { oneLine: false, fileToolsOffered: false }),
    [LARGE_FILE_CARD_KEY]: marker,
  };
}

function section(index: number, chars: number, live = true): LargeFileTextMarker {
  return {
    assetId: assetId(index),
    filename: `report-${index}.csv`,
    live,
    text: words(Math.ceil(chars / 7), index).slice(0, chars),
  };
}

function userTurn(
  question: string,
  cards: LargeFileCardMarker[],
  sections: LargeFileTextMarker[] = [],
): LedgerMessage {
  const parts = [
    { type: 'text', text: question },
    ...cards.map(cardPart),
    ...sections.map(largeFileTextPart),
  ];
  return {
    role: 'user',
    content: [question, ...cards.map((card) => cardPart(card).text)].join('\n'),
    multimodal_content: parts,
  };
}

function ledger(limitTokens: number, fileToolsOffered = true): AttachmentTurnLedgerState {
  return { limitTokens, charged: 0, readingClosed: false, fileToolsOffered };
}

let callCounter = 0;
function toolExchange(name: string, result: string): LedgerMessage[] {
  callCounter += 1;
  const id = `call_${callCounter}`;
  return [
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id, type: 'function', function: { name, arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: id, content: result },
  ];
}

/** A refused call's withdrawn-tool message is the governor's text, not file text. */
function isFileToolResult(messages: readonly LedgerMessage[], message: LedgerMessage): boolean {
  if (message.role !== 'tool' || message.content === withdrawnToolMessage(OPEN_FILE_TOOL_NAME))
    return false;
  return messages.some(
    (candidate) =>
      candidate.role === 'assistant' &&
      (candidate.tool_calls ?? []).some((call) => {
        const record = call as { id?: string; function?: { name?: string } };
        return record.id === message.tool_call_id && record.function?.name === OPEN_FILE_TOOL_NAME;
      }),
  );
}

/** Every attachment-derived token a step sends: cards, outlines, prepared text and file-tool results. */
function attachmentTokensSent(messages: readonly LedgerMessage[]): number {
  return messages.reduce((total, message) => {
    const parts = (message.multimodal_content ?? []).reduce(
      (sum: number, part) => sum + attachmentPartTokens(part),
      0,
    );
    const result = isFileToolResult(messages, message)
      ? estimateAttachmentTokens(message.content)
      : 0;
    return total + parts + result;
  }, 0);
}

function cardsOf(messages: readonly LedgerMessage[]): LargeFileCardMarker[] {
  return messages.flatMap((message) =>
    (message.multimodal_content ?? [])
      .map((part) => cardMarkerOf(part))
      .filter((card): card is LargeFileCardMarker => card !== null),
  );
}

function sectionsOf(messages: readonly LedgerMessage[]): LargeFileTextMarker[] {
  return messages.flatMap((message) =>
    (message.multimodal_content ?? [])
      .map((part) => textMarkerOf(part))
      .filter((found): found is LargeFileTextMarker => found !== null),
  );
}

/** One open_file call that takes all the room the step allows, as P11's tool does. */
function readWithAllowance(
  messages: LedgerMessage[],
  state: AttachmentTurnLedgerState,
  allowanceTokens: number,
): void {
  const budget = createStepReadingBudget(state, allowanceTokens);
  const chars = Math.floor(budget.remainingTokens() * 3.5);
  const text = words(Math.ceil(chars / 7), callCounter).slice(0, chars);
  budget.charge(budget.tokensFor(text));
  messages.push(...toolExchange(OPEN_FILE_TOOL_NAME, text));
}

function mostExpensiveCatalogRoute(): { modelId: string; routeId: string; usdPerMillion: number } {
  const routes = Object.entries(
    modelRegistry.routes as unknown as Record<string, { modelKey: string }>,
  )
    .map(([routeId, route]) => ({
      routeId,
      modelId: route.modelKey,
      sheet: getRoutePricing(routeId),
    }))
    .filter(
      (entry) =>
        entry.sheet?.unit === 'per_million_tokens' &&
        (entry.sheet.inputPerMillion ?? 0) > 0 &&
        (getModelMetadataById(entry.modelId)?.contextWindow ?? 0) > 0,
    )
    .sort((a, b) => (b.sheet!.inputPerMillion ?? 0) - (a.sheet!.inputPerMillion ?? 0));
  const top = routes[0]!;
  return { modelId: top.modelId, routeId: top.routeId, usdPerMillion: top.sheet!.inputPerMillion! };
}

function centsCap(usdPerMillion: number): number {
  return Math.floor(
    POLICY.maxInputCentsPerTurn / ((usdPerMillion * CENTS_PER_DOLLAR) / TOKENS_PER_MILLION),
  );
}

describe('attachmentTurnTokenLimit', () => {
  it('the policy ceiling binds on a cheap route with a large window', () => {
    const cheap =
      (POLICY.maxInputCentsPerTurn * TOKENS_PER_MILLION) /
      (CENTS_PER_DOLLAR * POLICY.maxAttachmentTokensPerTurn * 2);
    const window = Math.ceil((POLICY.maxAttachmentTokensPerTurn * 2) / POLICY.contextShare);

    expect(
      attachmentTurnTokenLimit({ contextWindow: window, inputUsdPerMillionTokens: cheap }),
    ).toBe(POLICY.maxAttachmentTokensPerTurn);
  });

  it('the cents cap binds on the expensive catalog fixture', () => {
    const expensive = mostExpensiveCatalogRoute();
    const window = getModelMetadataById(expensive.modelId)!.contextWindow!;
    const expected = centsCap(expensive.usdPerMillion);

    expect(expected).toBeLessThan(POLICY.contextShare * window);
    expect(expected).toBeLessThan(POLICY.maxAttachmentTokensPerTurn);
    expect(attachmentTurnTokenLimitForRoute(expensive.modelId, expensive.routeId)).toBe(expected);
  });

  it('the context share binds on a small window', () => {
    const window = 16_000;

    expect(attachmentTurnTokenLimit({ contextWindow: window, inputUsdPerMillionTokens: 0.1 })).toBe(
      Math.floor(POLICY.contextShare * window),
    );
  });

  it('a route with no price and a model with no window leave the ceiling', () => {
    expect(attachmentTurnTokenLimit({ contextWindow: null, inputUsdPerMillionTokens: null })).toBe(
      POLICY.maxAttachmentTokensPerTurn,
    );
  });
});

describe('applyAttachmentTurnStep', () => {
  it('the ledger never passes T over 10 chat steps, and no step sends more than it charges', () => {
    const limit = POLICY.maxAttachmentTokensPerTurn;
    const state = ledger(limit);
    const messages: LedgerMessage[] = [
      userTurn('What changed in Q3?', [cardMarker(1)], [section(1, 400_000)]),
    ];

    for (let step = 1; step <= 10; step += 1) {
      const before = state.charged;
      const result = applyAttachmentTurnStep(messages, state);
      if (result.readingOpen) {
        expect(attachmentTokensSent(messages)).toBeLessThanOrEqual(state.charged - before);
        readWithAllowance(messages, state, result.resultsAllowanceTokens);
      }
      expect(state.charged).toBeLessThanOrEqual(limit);
    }
  });

  it('step 3 of a tool loop still carries document text', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    const messages: LedgerMessage[] = [
      userTurn('Summarize the ledger.', [cardMarker(1)], [section(1, 400_000)]),
    ];

    for (let step = 1; step <= 3; step += 1) {
      const result = applyAttachmentTurnStep(messages, state);
      expect(result.readingOpen).toBe(true);
      messages.push(...toolExchange('web_search', 'results unrelated to the file'));
    }

    const [carried] = sectionsOf(messages);
    expect(carried?.text.length ?? 0).toBeGreaterThan(1_000);
  });

  it('a cut current-turn file is reported and its card asks for a partial-read answer', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn, false);
    const messages: LedgerMessage[] = [
      userTurn('Summarize.', [cardMarker(1)], [section(1, 2_000_000)]),
    ];

    const result = applyAttachmentTurnStep(messages, state);

    expect(result.cutLiveFilenames).toEqual(['report-1.csv']);
    const card = messages[0]!.multimodal_content!.find((part) => cardMarkerOf(part) !== null) as {
      text: string;
    };
    expect(card.text).toContain(LARGE_FILE_PARTIAL_READ_LINE);
  });

  it('when 2K passes R reading closes and never reopens: one-line cards, no text, stubs', () => {
    const limit = POLICY.maxAttachmentTokensPerTurn;
    const state = ledger(limit);
    const messages: LedgerMessage[] = [
      userTurn(
        'Compare the files.',
        [cardMarker(1), cardMarker(2)],
        [section(1, 50_000), section(2, 50_000)],
      ),
      ...toolExchange(OPEN_FILE_TOOL_NAME, words(4_000)),
      ...toolExchange('web_search', 'unrelated search result'),
    ];
    state.charged = limit - 2 * estimateAttachmentTokens(words(4_000)) + 1;

    const closing = applyAttachmentTurnStep(messages, state);

    expect(closing).toMatchObject({
      readingOpen: false,
      closedThisStep: true,
      resultsAllowanceTokens: 0,
    });
    expect(state.readingClosed).toBe(true);
    expect(cardsOf(messages).every((card) => card.oneLined === true)).toBe(true);
    expect(sectionsOf(messages)).toEqual([]);
    expect(messages[2]!.content).toBe(FILE_READING_REMOVED_STUB);
    expect(messages[4]!.content).toBe('unrelated search result');

    const chargedAtClose = state.charged;
    state.charged = 0;
    const later = applyAttachmentTurnStep(messages, state);
    expect(later.readingOpen).toBe(false);
    expect(later.closedThisStep).toBe(false);
    expect(state.charged).toBe(0);
    expect(chargedAtClose).toBeLessThanOrEqual(limit);
  });

  it('a call refused after closing keeps its withdrawn-tool message', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    state.readingClosed = true;
    const messages: LedgerMessage[] = [
      userTurn('Read on.', [cardMarker(1)]),
      ...toolExchange(OPEN_FILE_TOOL_NAME, words(1_000)),
      ...toolExchange(OPEN_FILE_TOOL_NAME, withdrawnToolMessage(OPEN_FILE_TOOL_NAME)),
    ];

    applyAttachmentTurnStep(messages, state);

    expect(messages[2]!.content).toBe(FILE_READING_REMOVED_STUB);
    expect(messages[4]!.content).toBe(withdrawnToolMessage(OPEN_FILE_TOOL_NAME));
  });

  it('after closing, 20 cards and 16 stubbed results stay under the out-of-ledger ceiling', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    const cards = Array.from({ length: 20 }, (_, index) => cardMarker(index + 1));
    const messages: LedgerMessage[] = [userTurn('Go through every file.', cards)];
    for (let index = 0; index < 16; index += 1) {
      messages.push(...toolExchange(OPEN_FILE_TOOL_NAME, words(2_000, index)));
    }
    state.readingClosed = true;

    applyAttachmentTurnStep(messages, state);

    const stubs = messages.filter((message) => message.content === FILE_READING_REMOVED_STUB);
    expect(stubs).toHaveLength(16);
    expect(attachmentTokensSent(messages)).toBeLessThan(OUT_OF_LEDGER_CEILING);
  });

  it('over 100 Work steps with file tools the loop reaches step 100 under the ceiling', () => {
    const limit = POLICY.maxAttachmentTokensPerTurn;
    const state = ledger(limit);
    const messages: LedgerMessage[] = [
      userTurn('Audit the ledger.', [cardMarker(1)], [section(1, 400_000)]),
    ];
    let steps = 0;

    for (let step = 1; step <= 100; step += 1) {
      const result = applyAttachmentTurnStep(messages, state);
      steps = step;
      if (result.readingOpen) {
        readWithAllowance(messages, state, result.resultsAllowanceTokens);
      } else {
        expect(attachmentTokensSent(messages)).toBeLessThan(OUT_OF_LEDGER_CEILING);
        messages.push(
          ...toolExchange(OPEN_FILE_TOOL_NAME, withdrawnToolMessage(OPEN_FILE_TOOL_NAME)),
        );
        messages.push(...toolExchange('python_exec', 'ok'));
      }
      expect(state.charged).toBeLessThanOrEqual(limit);
    }

    expect(steps).toBe(100);
    expect(state.readingClosed).toBe(true);
  });

  it('20 files on the expensive catalog fixture shrink to one-line cards within a quarter of T', () => {
    const expensive = mostExpensiveCatalogRoute();
    const limit = attachmentTurnTokenLimitForRoute(expensive.modelId, expensive.routeId);
    const state = ledger(limit);
    const cards = Array.from({ length: 20 }, (_, index) => cardMarker(index + 1));
    const messages: LedgerMessage[] = [userTurn('Which file has the totals?', cards)];

    applyAttachmentTurnStep(messages, state);

    const visible = cardsOf(messages);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((card) => card.oneLined === true)).toBe(true);
    const cardTokens = messages[0]!.multimodal_content!.reduce(
      (total: number, part) => total + attachmentPartTokens(part),
      0,
    );
    expect(cardTokens).toBeLessThanOrEqual(Math.floor(POLICY.cardsShare * limit));
    if (visible.length < cards.length) {
      expect(messages[0]!.content).toContain(`and ${cards.length - visible.length} more files`);
    }
  });

  it.each([
    ['a route priced at 3 USD per million input tokens', centsCap(3)],
    ['the policy ceiling', POLICY.maxAttachmentTokensPerTurn],
  ])('on %s a read that takes the whole allowance reaches the next step', (_label, limit) => {
    const state = ledger(limit);
    const messages: LedgerMessage[] = [
      userTurn('Find the totals.', [cardMarker(1)], [section(1, Math.ceil(limit * 3.5))]),
    ];
    let reads = 0;

    for (let step = 1; step <= 12; step += 1) {
      const result = applyAttachmentTurnStep(messages, state);
      if (reads > 0) {
        expect(result.readingOpen).toBe(true);
        const last = messages[messages.length - 1]!;
        expect(last.role).toBe('tool');
        expect(last.content).not.toBe(FILE_READING_REMOVED_STUB);
        expect(last.content.length).toBeGreaterThan(0);
      }
      if (!result.readingOpen || result.resultsAllowanceTokens <= 0) break;
      readWithAllowance(messages, state, result.resultsAllowanceTokens);
      reads += 1;
      expect(state.charged).toBeLessThanOrEqual(limit);
    }

    expect(reads).toBeGreaterThan(0);
  });

  it('a step reading budget keeps what is left of the allowance on the ledger', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    const budget = createStepReadingBudget(state, 900);

    budget.charge(400);

    expect(state.stepAllowanceLeft).toBe(500);
    expect(createStepReadingBudget(state, state.stepAllowanceLeft ?? 0).remainingTokens()).toBe(
      500,
    );
    expect(state.charged).toBe(400);
  });

  it('an unreadable file never points the model at the file tools', () => {
    const unreadable: LargeFileCardMarker = {
      ...cardMarker(1),
      lines: [cardMarker(1).oneLine, 'This file could not be read as text.'],
      partial: false,
      unreadable: true,
    };
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    const messages: LedgerMessage[] = [userTurn('What is in it?', [unreadable])];

    applyAttachmentTurnStep(messages, state);

    const text = (
      messages[0]!.multimodal_content!.find((part) => cardMarkerOf(part) !== null) as {
        text: string;
      }
    ).text;
    expect(text).toContain('This file could not be read as text.');
    expect(text).not.toContain(OPEN_FILE_TOOL_NAME);
    expect(text).not.toContain(LARGE_FILE_PARTIAL_READ_LINE);
  });

  it('a turn whose cards fit keeps them whole', () => {
    const state = ledger(POLICY.maxAttachmentTokensPerTurn);
    const messages: LedgerMessage[] = [userTurn('Read it.', [cardMarker(1)])];

    applyAttachmentTurnStep(messages, state);

    expect(cardsOf(messages)[0]?.oneLined).toBeUndefined();
  });
});

describe('fitTextSections', () => {
  it('later-turn caps never go above the step share', () => {
    const earlier = Array.from({ length: 6 }, (_, index) => section(index + 1, 60_000, false));
    const current = [section(10, 300_000, true)];

    for (const block of [1_000, 8_000, 30_000, 60_000, 200_000]) {
      const fit = fitTextSections([...earlier, ...current], block);
      const earlierTokens = fit.sections
        .filter((found) => !found.live)
        .map((found) => attachmentPartTokens(largeFileTextPart(found)));
      const earlierTotal = Math.min(POLICY.laterTurnTotalTokens, Math.floor(block / 2));
      expect(earlierTokens.reduce((total, tokens) => total + tokens, 0)).toBeLessThanOrEqual(
        earlierTotal,
      );
      for (const tokens of earlierTokens) {
        expect(tokens).toBeLessThanOrEqual(Math.min(POLICY.laterTurnFileTokens, earlierTotal));
      }
      expect(fit.tokens).toBeLessThanOrEqual(block);
    }
  });
});
