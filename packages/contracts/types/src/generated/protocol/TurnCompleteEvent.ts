
export type TurnCompleteEvent = {
  turn_id: string;
  last_agent_message: string | null;
  completed_at?: number | null;
  duration_ms?: number | null;
  time_to_first_token_ms?: number | null;
};
