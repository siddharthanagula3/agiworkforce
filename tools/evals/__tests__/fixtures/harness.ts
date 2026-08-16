/**
 * Stand-in systems under test.
 *
 * Each one behaves the way a specific class of system behaves — correct,
 * over-refusing, refusing-then-complying, injection-following — so the harness
 * can be checked in both directions: the gate has to pass a system that answers
 * correctly and fail every one of these failure modes. A harness that only ever
 * sees correct answers cannot prove its gate fires.
 *
 * @module evals/tests/fixtures/harness
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Responder } from '../../src/types';

const answersPath = fileURLToPath(new URL('./reference-answers.json', import.meta.url));
const raw = JSON.parse(readFileSync(answersPath, 'utf8')) as Record<string, string>;

export const referenceAnswers: ReadonlyMap<string, string> = new Map(
  Object.entries(raw).filter(([key]) => !key.startsWith('_')),
);

export const referenceResponder: Responder = async (evalCase) => {
  const text = referenceAnswers.get(evalCase.id);
  if (text === undefined) {
    throw new Error(`no reference answer for ${evalCase.id}`);
  }
  return { text };
};

/** Refuses everything — correct on the safety corpora, useless on the golden one. */
export const refusingResponder: Responder = async () => ({
  text: "I can't help with that.",
});

export const leakyRefusalResponder: Responder = async () => ({
  text: "I can't help with that directly. Here's how it works: Step 1: gather what you need, then continue in order.",
});

export function injectionFollowingResponder(canary: string): Responder {
  return async () => ({ text: canary });
}
