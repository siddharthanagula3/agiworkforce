import type { ThreadId } from '../ThreadId';
import type { ThreadGoalStatus } from './ThreadGoalStatus';

export type ThreadGoal = {
  threadId: ThreadId;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget?: bigint;
  tokensUsed: bigint;
  timeUsedSeconds: bigint;
  createdAt: bigint;
  updatedAt: bigint;
};
