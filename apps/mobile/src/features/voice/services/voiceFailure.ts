import { VoiceCaptureError } from './voiceInput';

export type VoiceFailureKind =
  | 'permission'
  | 'unavailable'
  | 'no-speech'
  | 'busy'
  | 'duration'
  | 'disabled'
  | 'aborted'
  | 'other';

export const VOICE_INPUT_DISABLED_MESSAGE =
  'Voice Input is off. Turn it on in Settings, Voice to use the microphone.';
export const VOICE_PERMISSION_MESSAGE =
  'Microphone access is off. Enable microphone permission in Settings to use voice.';
export const VOICE_UNAVAILABLE_MESSAGE =
  "Speech recognition isn't available on this device or for this language. You can type instead.";
export const VOICE_NO_SPEECH_MESSAGE = "Didn't catch that. Say it again.";
export const VOICE_BUSY_MESSAGE = 'Voice capture is already running.';
export const VOICE_STOPPED_MESSAGE = 'Voice input stopped. Try again, or type instead.';

export function classifyVoiceFailure(err: unknown): VoiceFailureKind {
  if (!(err instanceof VoiceCaptureError)) return 'other';
  switch (err.code) {
    case 'mic-permission-denied':
      return 'permission';
    case 'on-device-recognition-unavailable':
      return 'unavailable';
    case 'already-active':
      return 'busy';
    case 'max-duration-reached':
      return 'duration';
    case 'voice-input-disabled':
      return 'disabled';
    case 'aborted':
      return 'aborted';
    case 'recognition-error':
      if (err.nativeCode === 'no-speech' || err.nativeCode === 'speech-timeout') {
        return 'no-speech';
      }
      if (
        err.nativeCode === undefined ||
        err.nativeCode === 'service-not-allowed' ||
        err.nativeCode === 'language-not-supported'
      ) {
        return 'unavailable';
      }
      return 'other';
  }
}

export function voiceFailureMessage(err: unknown): string {
  const kind = classifyVoiceFailure(err);
  switch (kind) {
    case 'permission':
      return VOICE_PERMISSION_MESSAGE;
    case 'unavailable':
      return err instanceof VoiceCaptureError &&
        err.code === 'on-device-recognition-unavailable' &&
        err.nativeCode === undefined
        ? err.message
        : VOICE_UNAVAILABLE_MESSAGE;
    case 'no-speech':
      return VOICE_NO_SPEECH_MESSAGE;
    case 'busy':
      return VOICE_BUSY_MESSAGE;
    case 'duration':
      return (err as VoiceCaptureError).message;
    case 'disabled':
      return VOICE_INPUT_DISABLED_MESSAGE;
    case 'aborted':
    case 'other':
      return VOICE_STOPPED_MESSAGE;
  }
}
