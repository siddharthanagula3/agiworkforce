import type { ModeKind } from './ModeKind';

export type TurnStartedEvent = {
  turn_id: string;
  started_at?: number | null;
  model_context_window: bigint | null;
  collaboration_mode_kind: ModeKind;
};
