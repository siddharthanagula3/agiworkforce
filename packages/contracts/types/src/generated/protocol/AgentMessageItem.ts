import type { AgentMessageContent } from './AgentMessageContent';
import type { MemoryCitation } from './MemoryCitation';
import type { MessagePhase } from './MessagePhase';

export type AgentMessageItem = {
  id: string;
  content: Array<AgentMessageContent>;
  phase?: MessagePhase;
  memory_citation?: MemoryCitation;
};
