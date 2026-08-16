import type { ThreadId } from '../ThreadId';
import type { ThreadGoal } from './ThreadGoal';

export type ThreadGoalUpdatedEvent = { threadId: ThreadId; turnId?: string; goal: ThreadGoal };
