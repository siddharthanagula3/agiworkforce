import type { TurnAbortReason } from './TurnAbortReason';

export type TurnAbortedEvent = {
  turn_id: string | null;
  reason: TurnAbortReason;
  completed_at?: number | null;
  duration_ms?: number | null;
};
