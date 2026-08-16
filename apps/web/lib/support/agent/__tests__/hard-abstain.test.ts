
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
import { armModelMocks, modelMocks, queueModelJson } from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import { classifyHardAbstain, SUPPORT_ABSTAIN_CATEGORIES } from '../policy/hard-abstain';
import type { HardAbstainCategory, SupportAnswerInput } from '../types';

function ask(question: string): SupportAnswerInput {
  return {
    question,
    surface: 'app',
    viewer: { isSignedIn: true, userId: 'user_1', planTier: 'pro' },
  };
}

interface Case {
  category: HardAbstainCategory;
  question: string;
  reason: string;
  expectedPaths: string[];
}

const CASES: Case[] = [
  {
    category: 'billing',
    question: 'why was I charged twice on my last invoice for the Pro plan',
    reason: 'hard_abstain_billing',
    expectedPaths: ['/pricing', '/settings/billing', '/refund-policy'],
  },
  {
    category: 'data_deletion',
    question: 'how long do you keep my conversations after I delete my account',
    reason: 'hard_abstain_data_deletion',
    expectedPaths: ['/privacy', '/settings/privacy'],
  },
  {
    category: 'security',
    question: 'are my provider keys encrypted and have you had a breach',
    reason: 'hard_abstain_security',
    expectedPaths: ['/security', '/trust'],
  },
  {
    category: 'legal',
    question: 'do the terms of service let me resell access to my team',
    reason: 'hard_abstain_legal',
    expectedPaths: ['/terms', '/dpa', '/legal'],
  },
];

describe('hard-abstain categories', () => {
  beforeEach(() => {
    armModelMocks();
  });

  it('exposes exactly the four founder-mandated categories', () => {
    expect([...SUPPORT_ABSTAIN_CATEGORIES]).toEqual([
      'billing',
      'data_deletion',
      'security',
      'legal',
    ]);
  });

  it.each(CASES)(
    'refuses $category even though the corpus has related text',
    async ({ question, reason, expectedPaths, category }) => {
      const retrieval = retrieveSupportChunks(question);
      expect(retrieval.chunks.length).toBeGreaterThan(0);
      expect(classifyHardAbstain(question)).toBe(category);

      const result = await answerSupportQuestion(ask(question));

      expect(result.kind).toBe('abstention');
      if (result.kind !== 'abstention') return;
      expect(result.reason).toBe(reason);
      expect(result.handoffOffered).toBe(true);
      expect(result.text.length).toBeGreaterThan(20);
      expect(result.authoritativeLinks.map((link) => link.url)).toEqual(
        expectedPaths.map((path) => `${SITE_URL}${path}`),
      );

      expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
      expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
    },
  );

  it('refuses when the hard-abstain topic is in the prior turn, not the question', async () => {
    const result = await answerSupportQuestion({
      ...ask('and what about mine'),
      history: [
        { role: 'user', content: 'why was I charged for the Pro plan twice' },
        { role: 'assistant', content: 'I cannot help with that.' },
      ],
    });
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('hard_abstain_billing');
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('downgrades a completed, correctly-cited answer whose text drifts into a refused category', async () => {
    const question = 'how do I switch models mid conversation';
    const retrieval = retrieveSupportChunks(question);
    expect(retrieval.passedFloor).toBe(true);
    expect(classifyHardAbstain(question)).toBeNull();
    const realChunkId = retrieval.chunks[0]?.chunk.id;
    expect(realChunkId).toBeTruthy();

    queueModelJson({
      answer: 'You can switch freely; your invoice will be prorated and you were charged for it.',
      citedChunkIds: [realChunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const result = await answerSupportQuestion(ask(question));

    expect(modelMocks.drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('hard_abstain_billing');
    expect(result.authoritativeLinks.length).toBeGreaterThan(0);
  });

  it('classifies obvious phrasings but is honest about being pattern-based', () => {
    expect(classifyHardAbstain('can I get a refund')).toBe('billing');
    expect(classifyHardAbstain('delete my data please')).toBe('data_deletion');
    expect(classifyHardAbstain('are you SOC 2 compliant')).toBe('security');
    expect(classifyHardAbstain('what does the DPA cover')).toBe('legal');
    expect(classifyHardAbstain('how do I switch models mid conversation')).toBeNull();
  });
});
