import 'server-only';

import { recordModerationEvent } from './reporting';
import { classifyModerationText, type ModerationCategory } from './text-classifier';

export { matchDenylistedUpload } from './hash-denylist';
export { recordModerationEvent } from './reporting';

export interface ManagedPromptModerationInput {
  userId: string;
  segments: readonly string[];
  surface?: 'managed-chat' | 'managed-video';
}

export type ManagedPromptModeration =
  | { allowed: true; action: 'allow' | 'flag' }
  | {
      allowed: false;
      action: 'block';
      refusal: string;
      categories: readonly string[];
      ruleIds: readonly string[];
    };

export const PLATFORM_POLICY_REFUSAL =
  'This request was refused because it violates the AGI Workforce usage policy. No model request was sent.';

const MAX_MODERATED_CHARS = 200_000;

export function moderateManagedPrompt(
  input: ManagedPromptModerationInput,
): ManagedPromptModeration {
  const surface = input.surface ?? 'managed-chat';
  const categories = new Set<ModerationCategory>();
  const ruleIds = new Set<string>();
  const suppressedRuleIds = new Set<string>();
  let blocked = false;
  let flagged = false;
  let budget = MAX_MODERATED_CHARS;

  for (let index = input.segments.length - 1; index >= 0; index -= 1) {
    const segment = input.segments[index] ?? '';
    if (!segment) continue;
    if (budget <= 0) break;
    const verdict = classifyModerationText(segment.slice(0, budget));
    budget -= segment.length;

    for (const category of verdict.categories) categories.add(category);
    for (const ruleId of verdict.ruleIds) ruleIds.add(ruleId);
    for (const ruleId of verdict.suppressedRuleIds) suppressedRuleIds.add(`${ruleId}(suppressed)`);
    if (verdict.action === 'block') blocked = true;
    else if (verdict.action === 'flag') flagged = true;
  }

  const reportedRuleIds = [...ruleIds, ...suppressedRuleIds];

  if (blocked) {
    recordModerationEvent({
      surface,
      action: 'block',
      categories: [...categories],
      ruleIds: reportedRuleIds,
      userId: input.userId,
      text: input.segments.join('\n'),
    });
    return {
      allowed: false,
      action: 'block',
      refusal: PLATFORM_POLICY_REFUSAL,
      categories: [...categories],
      ruleIds: reportedRuleIds,
    };
  }

  if (flagged) {
    recordModerationEvent({
      surface,
      action: 'flag',
      categories: [...categories],
      ruleIds: reportedRuleIds,
      userId: input.userId,
      text: input.segments.join('\n'),
    });
    return { allowed: true, action: 'flag' };
  }

  return { allowed: true, action: 'allow' };
}
