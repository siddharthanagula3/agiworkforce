import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { HookEventName } from './HookEventName';
import type { HookExecutionMode } from './HookExecutionMode';
import type { HookHandlerType } from './HookHandlerType';
import type { HookOutputEntry } from './HookOutputEntry';
import type { HookRunStatus } from './HookRunStatus';
import type { HookScope } from './HookScope';
import type { HookSource } from './HookSource';

export type HookRunSummary = {
  id: string;
  event_name: HookEventName;
  handler_type: HookHandlerType;
  execution_mode: HookExecutionMode;
  scope: HookScope;
  source_path: AbsolutePathBuf;
  source: HookSource;
  display_order: bigint;
  status: HookRunStatus;
  status_message: string | null;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  entries: Array<HookOutputEntry>;
};
