
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { ...actual, resolveAutoRoute: modelMocks.resolveAutoRoute };
});
vi.mock('@/lib/services/provider-adapter-service', async () => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    buildServerProviderAdapter: modelMocks.buildServerProviderAdapter,
    toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async () => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { drainToLlmResponse: modelMocks.drainToLlmResponse };
});

import { SITE_URL } from '@/lib/seo/site';
import {
  armModelMocks,
  modelMocks,
  queueModelJson,
  queueModelRawText,
} from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import { extractJsonObject, parseModelAnswer } from '../answer/schema';
import type { SupportAnswerInput } from '../types';

const QUESTION = 'how do I add my anthropic api key';

function ask(overrides: Partial<SupportAnswerInput> = {}): SupportAnswerInput {
  return {
    question: QUESTION,
    surface: 'app',
    viewer: { isSignedIn: true, userId: 'user_1', planTier: 'free' },
    ...overrides,
  };
}

function topChunkId(): string {
  const id = retrieveSupportChunks(QUESTION).chunks[0]?.chunk.id;
  if (!id) throw new Error('expected the corpus to retrieve for the BYOK question');
  return id;
}

describe('citation invariant', () => {
  beforeEach(() => {
    armModelMocks();
  });

  it('POSITIVE CONTROL: a grounded answer reaches the provider and returns real citations', async () => {
    const chunkId = topChunkId();
    queueModelJson({
      answer: 'Open Settings, then Providers, and paste your Anthropic key.',
      citedChunkIds: [chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const result = await answerSupportQuestion(ask());

    expect(modelMocks.buildServerProviderAdapter).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    expect(result.citations[0]?.chunkId).toBe(chunkId);
    expect(result.citations[0]?.url.startsWith(SITE_URL)).toBe(true);
    expect(result.route.provider).toBe('anthropic');
    expect(result.handoffOffered).toBe(true);
  });

  it('abstains when the model writes a plausible URL but cites nothing', async () => {
    queueModelJson({
      answer: 'Add your key at https://agiworkforce.com/byok — see the BYOK guide.',
      citedChunkIds: [],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const result = await answerSupportQuestion(ask());

    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('unverifiable_citation');
    expect(result.handoffOffered).toBe(true);
  });

  it('drops chunk ids that were not in this turn’s retrieved set', async () => {
    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: ['not-a-real-chunk', topChunkId(), 'also-fake#9'],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const result = await answerSupportQuestion(ask());
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.chunkId).toBe(topChunkId());
  });

  it('de-duplicates a repeated chunk id', async () => {
    const chunkId = topChunkId();
    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: [chunkId, chunkId, chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });
    const result = await answerSupportQuestion(ask());
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.citations).toHaveLength(1);
  });

  it('abstains on malformed model output rather than salvaging prose', async () => {
    queueModelRawText('Sure! Just open settings and paste the key. Hope that helps.');
    const result = await answerSupportQuestion(ask());
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('malformed_model_output');
  });

  it('abstains when the model itself abstains', async () => {
    queueModelJson({
      answer: 'The excerpts do not cover this.',
      citedChunkIds: [],
      abstain: true,
      abstainReason: 'not_in_documentation',
      proposedActionId: null,
    });
    const result = await answerSupportQuestion(ask());
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('no_relevant_source');
  });

  it('abstains when the provider throws', async () => {
    modelMocks.drainToLlmResponse.mockRejectedValue(new Error('upstream 502'));
    const result = await answerSupportQuestion(ask());
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('model_unavailable');
    expect(result.route?.provider).toBe('anthropic');
  });

  it('only echoes a proposed action id that the caller actually offered', async () => {
    const chunkId = topChunkId();
    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: [chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: 'delete_account',
    });

    const refused = await answerSupportQuestion(
      ask({ availableActions: [{ id: 'export_account_data', title: 'Export', description: 'x' }] }),
    );
    expect(refused.kind).toBe('answer');
    if (refused.kind !== 'answer') return;
    expect(refused.proposedActionId).toBeNull();

    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: [chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: 'export_account_data',
    });
    const allowed = await answerSupportQuestion(
      ask({ availableActions: [{ id: 'export_account_data', title: 'Export', description: 'x' }] }),
    );
    expect(allowed.kind).toBe('answer');
    if (allowed.kind !== 'answer') return;
    expect(allowed.proposedActionId).toBe('export_account_data');
  });
});

describe('model output parsing', () => {
  it('extracts a balanced object out of a fenced or chatty response', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Here you go: {"a":{"b":2}} done')).toBe('{"a":{"b":2}}');
    expect(extractJsonObject('{"a":"}"}')).toBe('{"a":"}"}');
  });

  it('returns null rather than repairing broken output', () => {
    expect(extractJsonObject('no object here')).toBeNull();
    expect(extractJsonObject('{"a": 1')).toBeNull();
    expect(parseModelAnswer('{"answer": 42}')).toBeNull();
    expect(parseModelAnswer('{}')).toBeNull();
  });
});
