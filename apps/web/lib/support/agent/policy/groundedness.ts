import { uniqueTokens } from '../retrieval/tokenize';

export const MIN_GROUNDED_TOKEN_SHARE = 0.4;

export const OFF_TOPIC_TOKEN_SHARE = 0.2;

export const MIN_TOKENS_FOR_OFF_TOPIC_VERDICT = 4;

export type GroundednessVerdict = 'grounded' | 'ungrounded' | 'off_topic';

export interface GroundednessReading {
  verdict: GroundednessVerdict;
  share: number;
  answerTokenCount: number;
}

export function measureGroundedness(
  answer: string,
  sources: readonly string[],
): GroundednessReading {
  const answerTokens = uniqueTokens(answer);
  const sourceTokens = new Set<string>();
  for (const source of sources) {
    for (const token of uniqueTokens(source)) sourceTokens.add(token);
  }

  let grounded = 0;
  for (const token of answerTokens) {
    if (sourceTokens.has(token)) grounded += 1;
  }
  const share = answerTokens.length === 0 ? 0 : grounded / answerTokens.length;

  let verdict: GroundednessVerdict = 'ungrounded';
  if (share >= MIN_GROUNDED_TOKEN_SHARE) verdict = 'grounded';
  else if (
    answerTokens.length >= MIN_TOKENS_FOR_OFF_TOPIC_VERDICT &&
    share < OFF_TOPIC_TOKEN_SHARE
  ) {
    verdict = 'off_topic';
  }

  return { verdict, share, answerTokenCount: answerTokens.length };
}
