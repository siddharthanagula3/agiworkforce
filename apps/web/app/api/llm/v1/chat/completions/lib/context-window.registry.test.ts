import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { modelRegistry } from '@agiworkforce/model-registry';
import { getModelMetadataById } from '@agiworkforce/types';

import {
  planContextTrim,
  trimMessagesToContextWindow,
  type TrimmableMessage,
} from './context-window';

interface RegistryView {
  routes: Record<string, { modelKey: string; harnessId: string }>;
  capabilities: Record<string, { textOutput?: boolean | null }>;
}

const registry = modelRegistry as unknown as RegistryView;
const MAX_OUTPUT_TOKENS = 1_024;

function servedTextModels(): string[] {
  const keys = new Set<string>();
  for (const route of Object.values(registry.routes)) {
    if (route.harnessId.endsWith('/media')) continue;
    if (registry.capabilities[route.modelKey]?.textOutput !== true) continue;
    keys.add(route.modelKey);
  }
  return [...keys].sort();
}

function overflowingConversation(contextWindow: number): TrimmableMessage[] {
  const oldTurn = 'earlier context '.repeat(Math.ceil(contextWindow / 2));
  return [
    { role: 'system', content: 'stay on task' },
    { role: 'user', content: oldTurn },
    { role: 'assistant', content: 'noted' },
    { role: 'user', content: 'the question this turn has to answer' },
  ];
}

describe('context validation covers every model a chat turn can be served by', () => {
  const models = servedTextModels();

  it('enumerates the served models from the compiled registry', () => {
    expect(models.length).toBeGreaterThan(0);
  });

  it('resolves a context window for every served model, so no turn skips the check', () => {
    const unmeasured = models.filter((key) => (getModelMetadataById(key)?.contextWindow ?? 0) <= 0);
    expect(unmeasured).toEqual([]);
  });

  it('brings an over-long conversation under the budget for every distinct window', () => {
    const representativeByWindow = new Map<number, string>();
    for (const key of models) {
      const window = getModelMetadataById(key)?.contextWindow;
      if (window && !representativeByWindow.has(window)) representativeByWindow.set(window, key);
    }
    expect(representativeByWindow.size).toBeGreaterThan(0);

    for (const [window, key] of representativeByWindow) {
      const messages = overflowingConversation(window);
      const plan = planContextTrim(messages, key, MAX_OUTPUT_TOKENS);
      expect(plan, `${key} (${window} tokens) was not measured`).not.toBeNull();

      const result = trimMessagesToContextWindow(messages, key, MAX_OUTPUT_TOKENS);
      expect(result, key).not.toBeNull();
      expect(result!.estimatedTokensAfter, key).toBeLessThanOrEqual(result!.budgetTokens);
      expect(messages[messages.length - 1]?.content, key).toBe(
        'the question this turn has to answer',
      );

      const oversizedTurn: TrimmableMessage[] = [
        { role: 'system', content: 'stay on task' },
        { role: 'user', content: 'paste '.repeat(window * 2) },
      ];
      const shrunk = trimMessagesToContextWindow(oversizedTurn, key, MAX_OUTPUT_TOKENS);
      expect(shrunk, key).not.toBeNull();
      expect(shrunk!.truncatedMessages, key).toBeGreaterThan(0);
      expect(shrunk!.estimatedTokensAfter, key).toBeLessThanOrEqual(shrunk!.budgetTokens);
    }
  });
});
