import type { DeveloperAgentMode } from './DeveloperAgentMode';
import type { DeveloperReasoningEffort } from './DeveloperReasoningEffort';
import type { DeveloperRoutingTaskType } from './DeveloperRoutingTaskType';
import type { UserInput } from './UserInput';

export type TurnStartParams = {
  threadId: string;
  input: Array<UserInput>;
  model?: string;
  routingTaskType?: DeveloperRoutingTaskType;
  cwd?: string;
  agentMode?: DeveloperAgentMode;
  reasoningEffort?: DeveloperReasoningEffort;
  contextFiles?: Array<string>;
};
