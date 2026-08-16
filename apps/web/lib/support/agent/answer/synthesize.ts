import 'server-only';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import type {
  SupportAbstention,
  SupportAbstentionReason,
  SupportAnswer,
  SupportAnswerInput,
  SupportCitation,
  SupportRoute,
} from '../types';
import { getSupportCorpus } from '../corpus';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import {
  classifyHardAbstain,
  HARD_ABSTAIN_COPY,
  HARD_ABSTAIN_REASON,
} from '../policy/hard-abstain';
import { authoritativeCitations } from '../policy/authoritative-links';
import { renderSupportContext } from '../prompt/render-context';
import { callSupportModel } from './model-route';
import { parseModelAnswer } from './schema';

const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_TURNS = 6;

const inputSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      }),
    )
    .max(50)
    .optional(),
  surface: z.enum(['app', 'marketing']),
  viewer: z.object({
    isSignedIn: z.boolean(),
    userId: z.string().nullable(),
    planTier: z.string().nullable(),
  }),
  accountFacts: z
    .array(
      z.object({ label: z.string().max(120), value: z.string().max(400), sourceUrl: z.string() }),
    )
    .max(20)
    .optional(),
  availableActions: z
    .array(
      z.object({
        id: z.string().max(120),
        title: z.string().max(200),
        description: z.string().max(600),
      }),
    )
    .max(10)
    .optional(),
});

const GENERIC_ABSTENTION_COPY: Readonly<Record<SupportAbstentionReason, string>> = Object.freeze({
  no_relevant_source:
    "I can't find that in the product documentation, so I'm not going to guess. A human can pick this up.",
  hard_abstain_billing: HARD_ABSTAIN_COPY.billing,
  hard_abstain_data_deletion: HARD_ABSTAIN_COPY.data_deletion,
  hard_abstain_security: HARD_ABSTAIN_COPY.security,
  hard_abstain_legal: HARD_ABSTAIN_COPY.legal,
  unverifiable_citation:
    "I drafted an answer but couldn't tie it back to a real documentation source, so I'm not showing it. A human can pick this up.",
  malformed_model_output:
    "Something went wrong producing a grounded answer, so I'd rather say nothing than guess. A human can pick this up.",
  model_unavailable:
    "I can't answer right now. Rather than guess, here's how to reach a human who can help.",
  corpus_unavailable:
    "My documentation index isn't available right now, so I have nothing to ground an answer in. A human can pick this up.",
  agent_disabled:
    "Automated answers are turned off on this deployment. Here's how to reach a human who can help.",
  invalid_question: "I couldn't read that question. Try rephrasing it, or ask for a human.",
});

function abstain(
  reason: SupportAbstentionReason,
  links: SupportCitation[] = [],
  route: SupportRoute | null = null,
): SupportAbstention {
  return {
    kind: 'abstention',
    reason,
    text: GENERIC_ABSTENTION_COPY[reason],
    authoritativeLinks: links,
    handoffOffered: true,
    route,
  };
}

export async function answerSupportQuestion(input: SupportAnswerInput): Promise<SupportAnswer> {
  try {
    return await run(input);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[support-agent] unexpected failure',
    );
    return abstain('malformed_model_output');
  }
}

async function run(rawInput: SupportAnswerInput): Promise<SupportAnswer> {
  const parsedInput = inputSchema.safeParse(rawInput);
  if (!parsedInput.success) return abstain('invalid_question');
  const input = parsedInput.data;

  const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
  const lastUserTurn = [...history].reverse().find((turn) => turn.role === 'user')?.content ?? '';
  const category =
    classifyHardAbstain(input.question) ??
    (lastUserTurn ? classifyHardAbstain(lastUserTurn) : null);
  if (category) {
    return abstain(HARD_ABSTAIN_REASON[category], authoritativeCitations(category));
  }

  const corpus = getSupportCorpus();
  if (!corpus.available) {
    logger.error({ reason: corpus.reason }, '[support-agent] corpus unavailable');
    return abstain('corpus_unavailable');
  }

  const retrieval = retrieveSupportChunks(input.question);
  if (!retrieval.passedFloor) {
    return abstain('no_relevant_source');
  }

  const userMessage = renderSupportContext({
    question: input.question,
    history,
    chunks: retrieval.chunks,
    accountFacts: input.accountFacts ?? [],
    availableActions: input.availableActions ?? [],
  });

  const modelResult = await callSupportModel({
    userMessage,
    planTier: input.viewer.planTier,
    signal: rawInput.signal,
  });
  if (modelResult.status !== 'ok') {
    return abstain(
      modelResult.reason === 'disabled' ? 'agent_disabled' : 'model_unavailable',
      [],
      modelResult.route,
    );
  }
  const route = modelResult.route;

  const modelAnswer = parseModelAnswer(modelResult.text);
  if (!modelAnswer) {
    logger.warn({ provider: route.provider }, '[support-agent] model output failed schema');
    return abstain('malformed_model_output', [], route);
  }
  if (modelAnswer.abstain || modelAnswer.answer.trim().length === 0) {
    return abstain('no_relevant_source', [], route);
  }

  const retrievedById = new Map(retrieval.chunks.map((item) => [item.chunk.id, item.citation]));
  const citations: SupportCitation[] = [];
  const seen = new Set<string>();
  for (const id of modelAnswer.citedChunkIds) {
    const citation = retrievedById.get(id);
    if (!citation || seen.has(id)) continue;
    seen.add(id);
    citations.push(citation);
  }
  if (citations.length === 0) {
    return abstain('unverifiable_citation', [], route);
  }

  const answerCategory = classifyHardAbstain(modelAnswer.answer);
  if (answerCategory) {
    return abstain(
      HARD_ABSTAIN_REASON[answerCategory],
      authoritativeCitations(answerCategory),
      route,
    );
  }

  const allowed = new Set((input.availableActions ?? []).map((action) => action.id));
  const proposedActionId =
    modelAnswer.proposedActionId && allowed.has(modelAnswer.proposedActionId)
      ? modelAnswer.proposedActionId
      : null;

  return {
    kind: 'answer',
    text: modelAnswer.answer.trim(),
    citations,
    proposedActionId,
    route,
    handoffOffered: true,
  };
}
