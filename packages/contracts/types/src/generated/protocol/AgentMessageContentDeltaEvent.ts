
export type AgentMessageContentDeltaEvent = {
  thread_id: string;
  turn_id: string;
  item_id: string;
  delta: string;
};
