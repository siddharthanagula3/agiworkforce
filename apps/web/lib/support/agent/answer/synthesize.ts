import 'server-only';

/**
 * The grounded answer engine.
 *
 * Order of operations is the security design, not an implementation detail:
 *
 *   1. validate input                     -> abstention on failure
 *   2. hard-abstain classification        -> abstention BEFORE retrieval and
 *                                            BEFORE any provider call
 *   3. corpus load                        -> abstention if unavailable
 *   4. retrieval + relevance floor        -> abstention, model never called
 *   5. render prompt (documents fenced and sanitized)
 *   6. one bounded model call
 *   7. parse + schema                     -> abstention on any failure
 *   8. resolve citations SERVER-SIDE by chunk id lookup
 *                                         -> abstention if none survive
 *   9. re-classify the ANSWER TEXT        -> downgrade to abstention
 *  10. validate proposedActionId against the caller-supplied allowlist
 *
 * Steps 2 and 4 mean there is no code path from a refused category or an
 * unsupported question to a provider request. Step 8 means an answer without a
 * real, retrieved source cannot be returned at all.
 *
 * Abstention is a first-class success value — never a thrown error, never a
 * non-2xx.
 */

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

/**
 * The single entry point for the support answer engine.
 *
 * Never throws for an expected condition. An unexpected internal error is caught
 * and returned as an abstention, because a support surface that 500s tells the
 * user nothing about what to do next.
 */
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

  // ---- 2. Hard abstain, before retrieval and before any provider call -------
  const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
  const lastUserTurn = [...history].reverse().find((turn) => turn.role === 'user')?.content ?? '';
  const category =
    classifyHardAbstain(input.question) ??
    (lastUserTurn ? classifyHardAbstain(lastUserTurn) : null);
  if (category) {
    return abstain(HARD_ABSTAIN_REASON[category], authoritativeCitations(category));
  }

  // ---- 3. Corpus -----------------------------------------------------------
  const corpus = getSupportCorpus();
  if (!corpus.available) {
    logger.error({ reason: corpus.reason }, '[support-agent] corpus unavailable');
    return abstain('corpus_unavailable');
  }

  // ---- 4. Retrieval + relevance floor --------------------------------------
  const retrieval = retrieveSupportChunks(input.question);
  if (!retrieval.passedFloor) {
    return abstain('no_relevant_source');
  }

  // ---- 5/6. Render and call ------------------------------------------------
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

  // ---- 7. Parse ------------------------------------------------------------
  const modelAnswer = parseModelAnswer(modelResult.text);
  if (!modelAnswer) {
    logger.warn({ provider: route.provider }, '[support-agent] model output failed schema');
    return abstain('malformed_model_output', [], route);
  }
  if (modelAnswer.abstain || modelAnswer.answer.trim().length === 0) {
    return abstain('no_relevant_source', [], route);
  }

  // ---- 8. Resolve citations server-side by id lookup ------------------------
  // The model's ids are matched against THIS TURN's retrieved set. An id it did
  // not receive is dropped; nothing it wrote can name a source or a URL.
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

  // ---- 9. Re-classify the generated answer ---------------------------------
  // Second net for an obliquely phrased question that the pre-model gate missed.
  const answerCategory = classifyHardAbstain(modelAnswer.answer);
  if (answerCategory) {
    return abstain(
      HARD_ABSTAIN_REASON[answerCategory],
      authoritativeCitations(answerCategory),
      route,
    );
  }

  // ---- 10. Action allowlist ------------------------------------------------
  // The engine only ECHOES a validated id. It executes nothing, and an id the
  // caller did not offer is dropped rather than passed through.
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
