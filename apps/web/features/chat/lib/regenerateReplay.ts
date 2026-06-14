import type { SendReplayMetadata } from '../types/message-metadata';

const SKILL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for skill-guided turns. Re-send the prompt to keep the same skill instructions.';

const LEGACY_TOOL_REGENERATE_MESSAGE =
  'Regenerate is unavailable for this older tool-assisted turn. Re-send the prompt to preserve search, tools, files, or style options.';

export type RegenerateReplayDecision =
  | { ok: true; replay?: SendReplayMetadata }
  | { ok: false; message: string };

type RegenerateReplayMetadata = {
  sendReplay?: SendReplayMetadata;
  searchResults?: unknown;
  codeExecutionResult?: unknown;
  thinkingContent?: unknown;
  tools?: Array<{ name: string; status: string }>;
};

function hasLegacyToolAssistedOutput(metadata: RegenerateReplayMetadata | undefined): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.searchResults ||
    metadata.codeExecutionResult ||
    metadata.thinkingContent ||
    metadata.tools?.some((tool) => tool.name === 'web_search' || tool.name === 'code_execution'),
  );
}

export function getRegenerateReplayDecision(params: {
  userMetadata?: RegenerateReplayMetadata;
  assistantMetadata?: RegenerateReplayMetadata;
}): RegenerateReplayDecision {
  const replay = params.userMetadata?.sendReplay;
  if (replay?.hasSkillInstruction) {
    return { ok: false, message: SKILL_REGENERATE_MESSAGE };
  }

  if (!replay && hasLegacyToolAssistedOutput(params.assistantMetadata)) {
    return { ok: false, message: LEGACY_TOOL_REGENERATE_MESSAGE };
  }

  return replay ? { ok: true, replay } : { ok: true };
}

export function replayToSendOptions(replay: SendReplayMetadata | undefined): {
  webSearch?: boolean;
  thinkingEnabled?: boolean;
  codeExecution?: boolean;
  styleMode?: string;
} {
  return {
    webSearch: replay?.webSearchEnabled,
    thinkingEnabled: replay?.thinkingEnabled,
    codeExecution: replay?.codeExecutionEnabled,
    styleMode: replay?.styleMode,
  };
}
