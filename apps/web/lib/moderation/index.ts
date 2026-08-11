import 'server-only';

import { recordModerationEvent } from './reporting';
import { classifyModerationText, type ModerationCategory } from './text-classifier';

export { matchDenylistedUpload } from './hash-denylist';
export { recordModerationEvent } from './reporting';

/**
 * The platform moderation entry point for managed prompt text.
 *
 * Callers pass the prompt segments and a user id. They do NOT pass an
 * "enabled" flag, because there is no configuration — account, workspace, or
 * otherwise — that makes this not run. That is the whole point of the module:
 * the account-level "Reduce sensitive content" preference is a user comfort
 * setting layered on top of this floor, not a substitute for it.
 *
 * Every client-authored segment of the turn is classified, not just the last
 * one. A managed chat request accepts `system` messages from the caller and
 * forwards them to the provider, so moderating only the final user message
 * would be bypassed by putting the request in a system message and sending
 * "continue" as the user turn.
 */

export interface ManagedPromptModerationInput {
  userId: string;
  /** Client-authored text from the turn. Each segment is classified alone. */
  segments: readonly string[];
  /** Managed surface for privacy-preserving operational reporting. */
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

/**
 * Deliberately says nothing about which rule fired. The specific detector is
 * an oracle to tune an evasion against, and it is already in the report.
 */
export const PLATFORM_POLICY_REFUSAL =
  'This request was refused because it violates the AGI Workforce usage policy. No model request was sent.';

/**
 * Segments are classified independently rather than concatenated: proximity is
 * how the rules avoid false positives, and joining messages would put a word
 * from the top of the conversation within a rule's window of a word from the
 * bottom.
 *
 * The total is capped because the classifier is regex over every segment and a
 * caller controls how many messages it sends. Segments are consumed in reverse
 * order, so the most recent turns — the ones carrying the current request —
 * are the ones inside the budget.
 */
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
