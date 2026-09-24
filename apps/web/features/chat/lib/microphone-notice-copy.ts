import {
  getModelMetadataById,
  getRoutingSlotModel,
  providerLabels,
  type RoutingSlot,
} from '@agiworkforce/types';

export const MICROPHONE_NOTICE_STORAGE_KEY = 'agi.notice.microphone-audio';

export const MICROPHONE_NOTICE_TITLE = 'Where your voice goes';

export const MICROPHONE_NOTICE_LINK_LABEL = 'How AGI handles your data';

export const MICROPHONE_NOTICE_CONTINUE_LABEL = 'Continue';

export const MICROPHONE_NOTICE_DECLINE_LABEL = 'Not now';

export const DICTATION_AUDIO_SLOT: RoutingSlot = 'voice_transcription';

export const VOICE_MODE_AUDIO_SLOT: RoutingSlot = 'voice_live';

export function audioProviderLabel(slot: RoutingSlot): string | null {
  const model = getModelMetadataById(getRoutingSlotModel(slot));
  if (!model) return null;
  return providerLabels[String(model.provider)] ?? null;
}

export function microphoneNoticeBody(
  dictationProvider: string | null = audioProviderLabel(DICTATION_AUDIO_SLOT),
  voiceProvider: string | null = audioProviderLabel(VOICE_MODE_AUDIO_SLOT),
): string {
  const dictation = dictationProvider ?? 'the transcription provider';
  const voice = voiceProvider ?? 'the voice provider';
  const destination =
    dictation === voice
      ? `The audio goes to ${dictation}, which turns it into text or answers you in Voice Mode.`
      : `Dictation audio goes to ${dictation} to be turned into text, and Voice Mode audio goes to ${voice}, which answers you.`;
  return [
    'Dictation records from your microphone until you stop it, and Voice Mode listens while it is open and not muted.',
    destination,
    'AGI does not store the audio.',
    'The words become text in the conversation and are kept like anything you type.',
  ].join(' ');
}
