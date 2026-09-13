import { NativeModules } from 'react-native';
import { getRemoteChatDisabledReason } from '@/services/remoteChatGate';

export const LIVE_VOICE_MESSAGE = {
  microphoneDenied: 'Microphone access was denied. Allow the microphone to use live voice.',
  unsupported: 'Live voice needs a native build of this app, so voice stays turn based here.',
  connectionFailed: 'The live voice connection could not be established.',
  connectionDropped: 'The live voice connection dropped.',
  sessionEnded: 'The live voice session ended.',
  sessionRejected: 'The live voice session could not be started.',
} as const;

export const LIVE_VOICE_LOCAL_MODE_REASON =
  'Live voice runs in AGI Cloud, so Local Mode stays turn based.';
export const LIVE_VOICE_SIGNIN_REASON = 'Sign in to use live voice; this chat stays turn based.';

export function liveVoiceModeUnavailableReason(input: {
  executionMode: 'cloud' | 'local';
  signedIn: boolean;
}): string | null {
  if (input.executionMode !== 'cloud') return LIVE_VOICE_LOCAL_MODE_REASON;
  if (!input.signedIn) return LIVE_VOICE_SIGNIN_REASON;
  return getRemoteChatDisabledReason() ?? liveVoiceUnavailableReason();
}

/**
 * Read through NativeModules rather than importing react-native-webrtc: the
 * chat screens ask this on every voice entry, and importing the library there
 * would construct its native event emitter in a build that has no native
 * module at all.
 */
export function liveVoiceUnavailableReason(): string | null {
  const nativeModule = (NativeModules as Record<string, unknown>)['WebRTCModule'];
  if (!nativeModule) return LIVE_VOICE_MESSAGE.unsupported;
  return null;
}
