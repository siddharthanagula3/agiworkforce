import type { DecisionOutcome, DecisionQuestion, DecisionRequest } from '@agiworkforce/agent-core';

import { boundedState, DATA_NOT_INSTRUCTION } from './state';

// Version 1. An answer is only comparable with another answer to the same
// words, so this moves with DECISION_KINDS.memory_worth_extracting.
export const MEMORY_WORTH_EXTRACTING_VERSION = 1;

export const WORTH_EXTRACTING_KEY = 'durable_fact';

// "Durable" is the downstream extraction prompt's own definition, restated as
// a condition rather than a topic list, with the exclusions in the criteria.
const QUESTION: DecisionQuestion = {
  kind: 'boolean',
  instruction:
    'Does the most recent request state a fact about the person writing it that would still be ' +
    'true next week: who they are, their role, their employer, where they live, a language they ' +
    'use, a preference, a constraint they are under, a project they are working on, or a decision ' +
    'they have already made? A question, a hypothetical, a plan that may not happen, a detail of ' +
    'this one task, quoted or role-played speech, and a fact about somebody other than the writer ' +
    `all fail this condition, whichever pronoun they use. ${DATA_NOT_INSTRUCTION}`,
};

export function buildMemoryWorthExtractingRequest(message: string): DecisionRequest {
  return { state: boundedState(message, null), questions: { [WORTH_EXTRACTING_KEY]: QUESTION } };
}

export interface WorthExtractingVerdict {
  status: 'answered' | 'fallback';
  /** Null when there is no usable answer, never a substituted number. */
  probability: number | null;
  /** What the decision would have done, at the supplied threshold. */
  extract: boolean;
}

// On no answer the regex gate stands, which is what `baseline_stands` means
// for this kind: the interpreter reports the baseline rather than inventing one.
export function interpretWorthExtracting(
  outcome: DecisionOutcome,
  threshold: number,
  regexGate: boolean,
): WorthExtractingVerdict {
  const answer =
    outcome.status === 'fallback' ? null : outcome.result.answers[WORTH_EXTRACTING_KEY];
  const usable =
    answer?.kind === 'boolean' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  if (!usable) return { status: 'fallback', probability: null, extract: regexGate };
  return {
    status: 'answered',
    probability: answer.probability,
    // Union with the regex, not a replacement for it: the explicit-intent rule
    // is a fact about what the user asked for, not a guess about the text.
    extract: answer.probability >= threshold || regexGate,
  };
}
