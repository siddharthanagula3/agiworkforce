import type { ThreadId } from './ThreadId';
import type { TurnItem } from './TurnItem';

export type ItemStartedEvent = { thread_id: ThreadId; turn_id: string; item: TurnItem };
