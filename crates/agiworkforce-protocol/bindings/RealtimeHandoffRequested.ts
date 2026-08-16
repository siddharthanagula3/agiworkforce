import type { RealtimeTranscriptEntry } from './RealtimeTranscriptEntry';

export type RealtimeHandoffRequested = {
  handoff_id: string;
  item_id: string;
  input_transcript: string;
  active_transcript: Array<RealtimeTranscriptEntry>;
};
