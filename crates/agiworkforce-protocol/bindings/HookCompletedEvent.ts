import type { HookRunSummary } from './HookRunSummary';

export type HookCompletedEvent = { turn_id: string | null; run: HookRunSummary };
