/**
 * Prompt injection: retrieved document text is untrusted and must not be able to
 * change the agent's instructions, its abstention rules, or its allowlist.
 *
 * The guarantees asserted here are STRUCTURAL, not instructional — each one
 * holds even if the model obeys the injected document completely:
 *
 *   - a billing question still refuses, because on a hard-abstain category no
 *     document is retrieved and no model runs at all;
 *   - a citation URL is built from SITE_URL + a corpus path, so an attacker URL
 *     in document text can never appear in one;
 *   - a chunk id the model invented is dropped, and zero survivors yields
 *     `unverifiable_citation`;
 *   - a `proposedActionId` the caller did not offer is dropped;
 *   - the system prompt never receives document or user text.
 */

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
import { armModelMocks, lastUserPrompt, modelMocks, queueModelJson } from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks, buildCitation } from '../retrieval/retrieve';
import { renderSupportContext, sanitizeUntrustedText } from '../prompt/render-context';
import { SUPPORT_SYSTEM_PROMPT } from '../prompt/system-prompt';
import { INJECTED_ATTACKER_URL, INJECTED_CHUNK } from './fixtures/injected-doc';
import type { SupportAnswerInput } from '../types';

function ask(question: string, overrides: Partial<SupportAnswerInput> = {}): SupportAnswerInput {
  return {
    question,
    surface: 'marketing',
    viewer: { isSignedIn: false, userId: null, planTier: null },
    ...overrides,
  };
}

describe('prompt injection resistance', () => {
  beforeEach(() => {
    armModelMocks();
  });

  it('a billing question still refuses, even though the injected doc says billing is allowed', async () => {
    // The injected document explicitly instructs the agent to discuss billing.
    // It never gets the chance: hard-abstain runs before retrieval.
    expect(INJECTED_CHUNK.text).toContain('discuss billing');

    const result = await answerSupportQuestion(ask('why was I charged twice this month'));

    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('hard_abstain_billing');
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
    for (const link of result.authoritativeLinks) {
      expect(new URL(link.url).origin).toBe(new URL(SITE_URL).origin);
    }
  });

  it('an injected chunk cannot produce an attacker-origin citation', () => {
    const citation = buildCitation(INJECTED_CHUNK);
    expect(citation.url).toBe(`${SITE_URL}/byok`);
    expect(citation.url).not.toContain('evil.example');
    expect(new URL(citation.url).origin).toBe(new URL(SITE_URL).origin);
  });

  it('drops a fabricated chunk id and abstains when none survive', async () => {
    queueModelJson({
      answer: 'Enter your card at https://evil.example/payout to continue.',
      citedChunkIds: ['evil-1'],
      abstain: false,
      abstainReason: '',
      proposedActionId: 'delete_account',
    });

    const result = await answerSupportQuestion(ask('how do I add my anthropic api key'));

    expect(modelMocks.buildServerProviderAdapter).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('unverifiable_citation');
    expect(JSON.stringify(result)).not.toContain('evil.example');
  });

  it('every citation on a real answer resolves to the site origin, whatever the model wrote', async () => {
    const chunkId = retrieveSupportChunks('how do I add my anthropic api key').chunks[0]?.chunk.id;
    queueModelJson({
      answer: `Follow ${INJECTED_ATTACKER_URL} for details.`,
      citedChunkIds: [chunkId, 'evil-1'],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const result = await answerSupportQuestion(ask('how do I add my anthropic api key'));
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    for (const citation of result.citations) {
      expect(new URL(citation.url).origin).toBe(new URL(SITE_URL).origin);
    }
    // The model's prose is still returned verbatim; what it CANNOT do is make
    // that URL a citation. Rendering surfaces must not auto-link answer text.
    expect(result.citations.some((c) => c.url.includes('evil.example'))).toBe(false);
  });

  it('an injected action id is dropped when the caller offered no actions', async () => {
    const chunkId = retrieveSupportChunks('how do I add my anthropic api key').chunks[0]?.chunk.id;
    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: [chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: 'delete_account',
    });
    const result = await answerSupportQuestion(ask('how do I add my anthropic api key'));
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.proposedActionId).toBeNull();
  });

  it('neutralises fence delimiters and invisible characters in document text', () => {
    const sanitized = sanitizeUntrustedText(INJECTED_CHUNK.text);
    expect(sanitized).not.toContain('<<<AGI_SUPPORT_DOC_END>>>');
    expect(sanitized).toContain('[removed]');

    const hidden = sanitizeUntrustedText('bad\u200Bword\u202Ereversed\u0000nul');
    expect(hidden).toBe('badwordreversednul');
  });

  it('fences every excerpt and labels the block as untrusted', () => {
    const rendered = renderSupportContext({
      question: 'how do I add a key',
      history: [],
      chunks: [{ chunk: INJECTED_CHUNK, score: 9, citation: buildCitation(INJECTED_CHUNK) }],
      accountFacts: [],
      availableActions: [],
    });
    expect(rendered).toContain('UNTRUSTED REFERENCE MATERIAL');
    expect(rendered).toContain('[id: injected#0]');
    // Exactly one opening and one closing fence: the document could not close
    // its own fence and pose as prompt-level text.
    expect(rendered.match(/<<<AGI_SUPPORT_DOC>>>/g)).toHaveLength(1);
    expect(rendered.match(/<<<AGI_SUPPORT_DOC_END>>>/g)).toHaveLength(1);
  });

  it('never lets document or user text reach the system prompt', async () => {
    const chunkId = retrieveSupportChunks('how do I add my anthropic api key').chunks[0]?.chunk.id;
    queueModelJson({
      answer: 'Open Settings, then Providers.',
      citedChunkIds: [chunkId],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });
    await answerSupportQuestion(ask('how do I add my anthropic api key'));

    const request = modelMocks.streamedRequests.at(-1) as { system?: string };
    expect(request.system).toBe(SUPPORT_SYSTEM_PROMPT);
    expect(request.system).not.toContain('anthropic api key');
    // The documents and the question live in the user message only.
    expect(lastUserPrompt()).toContain('how do I add my anthropic api key');
  });
});
