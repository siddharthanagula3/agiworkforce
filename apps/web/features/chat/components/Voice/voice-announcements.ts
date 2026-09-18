import { VOICE_SESSION_STATUS, type VoiceSessionStatus } from '@agiworkforce/unified-chat';

export const VOICE_ANNOUNCEMENT = {
  connecting: 'Connecting to voice',
  listening: 'Listening',
  transcribing: 'Transcribing what you said',
  sending: 'Sending your turn',
  thinking: 'Working on your request',
  speaking: 'Assistant is speaking',
  muted: 'Microphone muted',
} as const;

export interface VoiceAnnouncementInput {
  readonly status: VoiceSessionStatus;
  readonly muted: boolean;
  readonly backendBusy: boolean;
}

const BY_STATUS: Partial<Record<VoiceSessionStatus, string>> = {
  [VOICE_SESSION_STATUS.entering]: VOICE_ANNOUNCEMENT.connecting,
  [VOICE_SESSION_STATUS.listening]: VOICE_ANNOUNCEMENT.listening,
  [VOICE_SESSION_STATUS.transcribing]: VOICE_ANNOUNCEMENT.transcribing,
  [VOICE_SESSION_STATUS.sending]: VOICE_ANNOUNCEMENT.sending,
  [VOICE_SESSION_STATUS.streaming]: VOICE_ANNOUNCEMENT.thinking,
  [VOICE_SESSION_STATUS.speaking]: VOICE_ANNOUNCEMENT.speaking,
  [VOICE_SESSION_STATUS.muted]: VOICE_ANNOUNCEMENT.muted,
};

/**
 * The polite region owns state only. An error has its own role="alert" and a
 * reconnect its own role="status", so neither is repeated here.
 */
export function voiceStatusAnnouncement(input: VoiceAnnouncementInput): string {
  if (input.status === VOICE_SESSION_STATUS.exited) return '';
  if (input.status === VOICE_SESSION_STATUS.error) return '';
  if (input.muted && input.status !== VOICE_SESSION_STATUS.speaking) {
    return VOICE_ANNOUNCEMENT.muted;
  }
  if (input.backendBusy && input.status !== VOICE_SESSION_STATUS.speaking) {
    return VOICE_ANNOUNCEMENT.thinking;
  }
  return BY_STATUS[input.status] ?? '';
}
