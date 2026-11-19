import {
  startCaptureSession,
  type VoiceCaptureSession,
  type VoiceInputMeteringEvent,
  type VoicePartialResult,
} from './voiceInput';
import { activeSpeechLanguage } from './speechSettings';
export { VoiceCaptureError, type VoicePartialResult } from './voiceInput';

export type VoiceMeteringEvent = VoiceInputMeteringEvent & {
  isDoneRecording: boolean;
};

export type RecordingSession = VoiceCaptureSession;

export async function startRecording(
  onMetering?: (event: VoiceMeteringEvent) => void,
  signal?: AbortSignal,
  onPartial?: (partial: VoicePartialResult) => void,
): Promise<RecordingSession> {
  return startCaptureSession(
    onMetering ? (event) => onMetering({ ...event, isDoneRecording: false }) : undefined,
    onPartial,
    { lang: activeSpeechLanguage(), ...(signal ? { signal } : {}) },
  );
}
