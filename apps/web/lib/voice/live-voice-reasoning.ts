import 'server-only';

import {
  clampEffortToEntitlement,
  getModelEffortOptions,
  isFreeBillingPlanTier,
  resolveModelEffort,
  type Effort,
} from '@agiworkforce/types';
import { LIVE_VOICE_REASONING, type LiveVoiceReasoning } from '@agiworkforce/types/live-voices';

/**
 * The reasoning efforts a GPT-Live Responses delegation accepts
 * (delegation.responses.reasoning.effort in the Live session reference).
 * The backend model may support more, such as max, which the session refuses.
 */
const DELEGATION_EFFORTS: readonly Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export interface LiveVoiceReasoningChoice {
  level: LiveVoiceReasoning;
  effort: Effort | null;
}

/**
 * Instant is the lowest effort the backend supports and Thinking its default,
 * the depth chat uses. Free is held to Instant here, on the server, whatever
 * the client asked for, and a paid tier is clamped by the same entitlement
 * that gates effort in chat.
 */
export function resolveLiveVoiceReasoning(input: {
  backendModelId: string;
  requested: LiveVoiceReasoning | null | undefined;
  planTier: string | null | undefined;
}): LiveVoiceReasoningChoice {
  const options = getModelEffortOptions(input.backendModelId).filter((effort) =>
    DELEGATION_EFFORTS.includes(effort),
  );
  const ordered = [...options].sort(
    (a, b) => DELEGATION_EFFORTS.indexOf(a) - DELEGATION_EFFORTS.indexOf(b),
  );
  const lowest = ordered[0] ?? null;
  const free = isFreeBillingPlanTier((input.planTier ?? 'free').toLowerCase());
  if (input.requested !== LIVE_VOICE_REASONING.thinking || free || ordered.length < 2) {
    return { level: LIVE_VOICE_REASONING.instant, effort: lowest };
  }
  const thinking = clampEffortToEntitlement(
    input.backendModelId,
    resolveModelEffort(input.backendModelId, null),
    input.planTier,
  );
  const effort =
    thinking && ordered.includes(thinking) && thinking !== lowest
      ? thinking
      : (ordered[1] ?? lowest);
  return { level: LIVE_VOICE_REASONING.thinking, effort };
}
