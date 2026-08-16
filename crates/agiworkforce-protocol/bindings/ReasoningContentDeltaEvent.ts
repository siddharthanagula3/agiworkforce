
export type ReasoningContentDeltaEvent = {
  thread_id: string;
  turn_id: string;
  item_id: string;
  delta: string;
  summary_index: bigint;
};
