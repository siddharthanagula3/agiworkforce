/**
 * Regenerate replay — shared, pure decision helpers.
 *
 * Canonical home for the regenerate mechanism the web surface extracted first
 * (`apps/web/features/chat/lib/regenerateReplay.ts` and the
 * `planRegenerateRollback` half of `apps/web/features/chat/lib/pendingEdit.ts`,
 * both of which now re-export from here). Desktop Cloud needs the identical
 * rules, and two copies of "may this turn be regenerated?" is exactly the kind
 * of drift that produces a Retry button on one surface that silently loses the
 * user's search/tool/style options on the other.
 *
 * Everything here is pure: no store reads, no network, no React. Hosts own the
 * transcript truncation, the durable delete, and the re-send.
 */

import type { CloudWorkMode } from '@agiworkforce/types';

const SKILL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for skill-guided turns. Re-send the prompt to keep the same skill instructions.';

const LEGACY_TOOL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for this older tool-assisted turn. Re-send the prompt to preserve search, tools, files, or style options.';

/**
 * The send-time options a user turn recorded so a regenerate can reproduce it.
 * Surfaces narrow `styleMode` to their own style vocabulary via the generic
 * parameter on the helpers below; the shared shape keeps it a plain string.
 */
export interface SendReplayMetadataLike {
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  officeCreationEnabled?: boolean;
  workMode?: CloudWorkMode;
  styleMode?: string;
  hasSkillInstruction?: boolean;
}

export type RegenerateReplayDecision<R extends SendReplayMetadataLike = SendReplayMetadataLike> =
  | { ok: true; replay?: R }
  | { ok: false; message: string };

/**
 * The subset of a message's metadata bag the decision reads. Hosts whose
 * `metadata` is an untyped `Record<string, unknown>` cast to this at the call
 * site rather than restating the shape.
 */
export interface RegenerateReplayMetadata<
  R extends SendReplayMetadataLike = SendReplayMetadataLike,
> {
  sendReplay?: R;
  agentActivity?: unknown;
  cloudAgentRun?: unknown;
  searchResults?: unknown;
  codeExecutionResult?: unknown;
  thinkingContent?: unknown;
  tools?: Array<{ name: string; status: string }>;
}

function hasLegacyToolAssistedOutput<R extends SendReplayMetadataLike>(
  metadata: RegenerateReplayMetadata<R> | undefined,
): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.searchResults ||
    metadata.codeExecutionResult ||
    metadata.thinkingContent ||
    metadata.tools?.some((tool) => tool.name === 'web_search' || tool.name === 'code_execution'),
  );
}

/**
 * Decide whether an assistant turn can be regenerated, and with which recorded
 * send options.
 *
 * Refuses two cases outright rather than silently re-sending a different
 * request: a skill-guided turn (the catalog instruction is not replayable from
 * the client) and a legacy tool-assisted turn recorded before `sendReplay`
 * existed (its search/code/style flags are unknowable, so a replay would
 * quietly drop them).
 */
export function getRegenerateReplayDecision<
  R extends SendReplayMetadataLike = SendReplayMetadataLike,
>(params: {
  userMetadata?: RegenerateReplayMetadata<R>;
  assistantMetadata?: RegenerateReplayMetadata<R>;
}): RegenerateReplayDecision<R> {
  const replay = params.userMetadata?.sendReplay;
  const inferredWorkMode =
    params.assistantMetadata?.agentActivity || params.assistantMetadata?.cloudAgentRun
      ? 'agiwork'
      : undefined;
  if (replay?.hasSkillInstruction) {
    return { ok: false, message: SKILL_REGENERATE_MESSAGE };
  }

  if (!replay && !inferredWorkMode && hasLegacyToolAssistedOutput(params.assistantMetadata)) {
    return { ok: false, message: LEGACY_TOOL_REGENERATE_MESSAGE };
  }

  const safeReplay =
    replay || inferredWorkMode
      ? ({
          ...replay,
          workMode: replay?.workMode ?? inferredWorkMode,
        } as R)
      : undefined;
  return safeReplay ? { ok: true, replay: safeReplay } : { ok: true };
}

export function replayToSendOptions<R extends SendReplayMetadataLike = SendReplayMetadataLike>(
  replay: R | undefined,
): {
  webSearch?: boolean;
  thinkingEnabled?: boolean;
  codeExecution?: boolean;
  officeCreation?: boolean;
  workMode?: R['workMode'];
  styleMode?: R['styleMode'];
} {
  return {
    webSearch: replay?.webSearchEnabled,
    thinkingEnabled: replay?.thinkingEnabled,
    codeExecution: replay?.codeExecutionEnabled,
    officeCreation: replay?.officeCreationEnabled,
    workMode: replay?.workMode,
    styleMode: replay?.styleMode,
  };
}

interface MinimalMessage {
  id: string;
  role: string;
}

/**
 * Plan the rollback for regenerating the assistant message `assistantId`.
 *
 * Regeneration deletes the user turn being regenerated (the nearest preceding
 * user message), its assistant reply, and anything after, then re-sends the user
 * content. The rollback range MUST start at that user message — rolling back only
 * from the assistant leaves the original user message in place, so re-sending its
 * content produces a duplicate user message. Returns the user message index (so
 * the caller can read its content/attachments/metadata) plus the ids to delete,
 * or `null` if there's no regenerable user turn.
 */
export function planRegenerateRollback(
  messages: readonly MinimalMessage[],
  assistantId: string,
): { userIndex: number; rollbackIds: string[] } | null {
  const idx = messages.findIndex((m) => m.id === assistantId);
  if (idx <= 0) return null;
  let userIndex = -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      userIndex = i;
      break;
    }
  }
  if (userIndex < 0) return null;
  return { userIndex, rollbackIds: messages.slice(userIndex).map((m) => m.id) };
}
