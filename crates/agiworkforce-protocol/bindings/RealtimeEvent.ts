import type { RealtimeAudioFrame } from './RealtimeAudioFrame';
import type { RealtimeHandoffRequested } from './RealtimeHandoffRequested';
import type { RealtimeInputAudioSpeechStarted } from './RealtimeInputAudioSpeechStarted';
import type { RealtimeNoopRequested } from './RealtimeNoopRequested';
import type { RealtimeResponseCancelled } from './RealtimeResponseCancelled';
import type { RealtimeResponseCreated } from './RealtimeResponseCreated';
import type { RealtimeResponseDone } from './RealtimeResponseDone';
import type { RealtimeTranscriptDelta } from './RealtimeTranscriptDelta';
import type { RealtimeTranscriptDone } from './RealtimeTranscriptDone';
import type { JsonValue } from './serde_json/JsonValue';

export type RealtimeEvent =
  | { SessionUpdated: { session_id: string; instructions: string | null } }
  | { InputAudioSpeechStarted: RealtimeInputAudioSpeechStarted }
  | { InputTranscriptDelta: RealtimeTranscriptDelta }
  | { InputTranscriptDone: RealtimeTranscriptDone }
  | { OutputTranscriptDelta: RealtimeTranscriptDelta }
  | { OutputTranscriptDone: RealtimeTranscriptDone }
  | { AudioOut: RealtimeAudioFrame }
  | { ResponseCreated: RealtimeResponseCreated }
  | { ResponseCancelled: RealtimeResponseCancelled }
  | { ResponseDone: RealtimeResponseDone }
  | { ConversationItemAdded: JsonValue }
  | { ConversationItemDone: { item_id: string } }
  | { HandoffRequested: RealtimeHandoffRequested }
  | { NoopRequested: RealtimeNoopRequested }
  | { Error: string };
