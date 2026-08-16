import type { RealtimeConversationVersion } from './RealtimeConversationVersion';

export type RealtimeConversationStartedEvent = {
  session_id: string | null;
  version: RealtimeConversationVersion;
};
