import type { HookRunSummary } from './HookRunSummary';

export type HookStartedEvent = { turn_id: string | null; run: HookRunSummary };
