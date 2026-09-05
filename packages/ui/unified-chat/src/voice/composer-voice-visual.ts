import type { ComposerVoiceState } from './composer-voice-contract';
import { ORB_STATE, ORB_STATE_LABEL, type OrbState } from './voice-session-machine';

const BUSY_ORB_STATE: Readonly<Record<string, OrbState>> = {
  listening: ORB_STATE.listening,
  transcribing: ORB_STATE.thinking,
  processing: ORB_STATE.thinking,
  awaiting_action: ORB_STATE.thinking,
  executing: ORB_STATE.thinking,
  stopping: ORB_STATE.thinking,
};

export function orbStateForComposerVoiceState(state: ComposerVoiceState): OrbState {
  return BUSY_ORB_STATE[state] ?? ORB_STATE.idle;
}

export function composerVoiceStateLabel(state: ComposerVoiceState): string {
  return ORB_STATE_LABEL[orbStateForComposerVoiceState(state)];
}

export function isComposerVoiceStateBusy(state: ComposerVoiceState): boolean {
  return state in BUSY_ORB_STATE;
}

export interface ComposerVoiceTranscriptionFlags {
  isRecording: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
}

export function composerVoiceStateFromTranscription(
  workflow: ComposerVoiceState,
  flags: ComposerVoiceTranscriptionFlags,
): ComposerVoiceState {
  if (flags.isRecording) return 'listening';
  if (flags.isTranscribing) return 'transcribing';
  if (!flags.isSupported) return 'unsupported';
  return workflow;
}
