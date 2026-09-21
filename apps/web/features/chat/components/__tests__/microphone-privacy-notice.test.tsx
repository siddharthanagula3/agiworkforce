import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getModelMetadataById, getRoutingSlotModel, providerLabels } from '@agiworkforce/types';

import {
  DICTATION_AUDIO_SLOT,
  VOICE_MODE_AUDIO_SLOT,
  audioProviderLabel,
  microphoneNoticeBody,
} from '../../lib/microphone-notice-copy';

const MICROPHONE_SLOTS = [DICTATION_AUDIO_SLOT, VOICE_MODE_AUDIO_SLOT] as const;

describe('where the microphone notice says the audio goes', () => {
  it.each(MICROPHONE_SLOTS)('names the provider the %s slot actually routes to', (slot) => {
    const model = getModelMetadataById(getRoutingSlotModel(slot));
    expect(model, `${slot} must resolve to a catalogued model`).not.toBeNull();
    const label = providerLabels[String(model?.provider)];
    expect(label, `${slot} must resolve to a labelled provider`).toBeTruthy();

    expect(audioProviderLabel(slot)).toBe(label);
    expect(microphoneNoticeBody()).toContain(`goes to ${label}`);
  });

  it('names each provider with its own job when the two paths part ways', () => {
    expect(microphoneNoticeBody('Provider A', 'Provider B')).toContain(
      'Dictation audio goes to Provider A to be turned into text, and Voice Mode audio goes to Provider B, which answers you.',
    );
  });

  it('says what is captured, when, that the audio is not stored, and that the text is kept', () => {
    expect(microphoneNoticeBody('OpenAI', 'OpenAI')).toBe(
      'Dictation records from your microphone until you stop it, and Voice Mode listens while it is open and not muted. The audio goes to OpenAI, which turns it into text or answers you in Voice Mode. AGI does not store the audio. The words become text in the conversation and are kept like anything you type.',
    );
  });
});

describe('where the microphone notice is mounted', () => {
  it('is rendered by the chat page beside the composer on the empty and the active transcript', () => {
    const page = readFileSync(
      join(resolve(__dirname, '../../..'), 'chat/pages/WebChatPage.tsx'),
      'utf8',
    );
    expect(page.match(/<MicrophonePrivacyNotice\s*\/>/g)).toHaveLength(2);
  });
});
