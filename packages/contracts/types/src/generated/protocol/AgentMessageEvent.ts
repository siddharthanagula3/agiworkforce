import type { MemoryCitation } from './MemoryCitation';
import type { MessagePhase } from './MessagePhase';

export type AgentMessageEvent = {
  message: string;
  phase: MessagePhase | null;
  memory_citation: MemoryCitation | null;
};
