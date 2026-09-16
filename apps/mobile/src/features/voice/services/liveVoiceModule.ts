export type LiveVoiceModule = typeof import('./liveVoiceSession');

let cached: LiveVoiceModule | null = null;

/**
 * react-native-webrtc builds a native event emitter the moment it is imported,
 * so the chat screens must not pull it in until a live session actually starts.
 */
export async function loadLiveVoiceModule(): Promise<LiveVoiceModule> {
  cached ??= await import('./liveVoiceSession');
  return cached;
}
