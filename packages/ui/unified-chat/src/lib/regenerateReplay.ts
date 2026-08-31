import type { CloudWorkMode } from '@agiworkforce/types';

// Only a turn recorded before the skill's name was carried in the replay. A
// turn that names its skill regenerates with that skill.
const UNIDENTIFIED_SKILL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for this older skill-guided turn. Re-send the prompt to keep the same skill instructions.';

const LEGACY_TOOL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for this older tool-assisted turn. Re-send the prompt to preserve search, tools, files, or style options.';

export interface SendReplayMetadataLike {
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  officeCreationEnabled?: boolean;
  workMode?: CloudWorkMode;
  styleMode?: string;
  hasSkillInstruction?: boolean;
  skillName?: string;
}

export type RegenerateReplayDecision<R extends SendReplayMetadataLike = SendReplayMetadataLike> =
  | { ok: true; replay?: R }
  | { ok: false; message: string };

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
  if (replay?.hasSkillInstruction && !replay.skillName) {
    return { ok: false, message: UNIDENTIFIED_SKILL_REGENERATE_MESSAGE };
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
  skillName?: string;
} {
  return {
    webSearch: replay?.webSearchEnabled,
    thinkingEnabled: replay?.thinkingEnabled,
    codeExecution: replay?.codeExecutionEnabled,
    officeCreation: replay?.officeCreationEnabled,
    workMode: replay?.workMode,
    styleMode: replay?.styleMode,
    skillName: replay?.skillName,
  };
}

interface MinimalMessage {
  id: string;
  role: string;
}

/**
 * The edit-and-resend counterpart of {@link planRegenerateRollback}, addressed
 * by the USER turn being rewritten rather than by the assistant reply.
 *
 * Everything from the edited turn onward is superseded, not just its immediate
 * answer: a later turn was written in reply to text the user has now changed,
 * so leaving it would produce a transcript that answers a question nobody
 * asked. This mirrors how regenerate rolls back from `userIndex`.
 */
export function planEditRollback(
  messages: readonly MinimalMessage[],
  userMessageId: string,
): { userIndex: number; rollbackIds: string[] } | null {
  const userIndex = messages.findIndex((m) => m.id === userMessageId);
  if (userIndex < 0) return null;
  if (messages[userIndex]?.role !== 'user') return null;
  return { userIndex, rollbackIds: messages.slice(userIndex).map((m) => m.id) };
}

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
