import { describe, expect, it } from 'vitest';

import {
  composerVoiceStateFromTranscription,
  composerVoiceStateLabel,
  isComposerVoiceStateBusy,
  orbStateForComposerVoiceState,
} from './composer-voice-visual';
import { ORB_STATE } from './voice-session-machine';
import type { ComposerVoiceState } from './composer-voice-contract';

describe('orbStateForComposerVoiceState', () => {
  it('renders listening as its own orb state', () => {
    expect(orbStateForComposerVoiceState('listening')).toBe(ORB_STATE.listening);
  });

  it('folds every desktop workflow state into thinking', () => {
    const thinking: ComposerVoiceState[] = [
      'transcribing',
      'processing',
      'awaiting_action',
      'executing',
      'stopping',
    ];
    for (const state of thinking) {
      expect(orbStateForComposerVoiceState(state)).toBe(ORB_STATE.thinking);
    }
  });

  it('renders idle, error and unsupported as the resting orb', () => {
    const resting: ComposerVoiceState[] = ['idle', 'error', 'unsupported'];
    for (const state of resting) {
      expect(orbStateForComposerVoiceState(state)).toBe(ORB_STATE.idle);
    }
  });
});

describe('composerVoiceStateLabel', () => {
  it('words listening and the thinking states the same as the web orb', () => {
    expect(composerVoiceStateLabel('listening')).toBe('Listening');
    expect(composerVoiceStateLabel('executing')).toBe('Thinking');
    expect(composerVoiceStateLabel('processing')).toBe('Thinking');
  });

  it('says nothing for idle, error and unsupported', () => {
    expect(composerVoiceStateLabel('idle')).toBe('');
    expect(composerVoiceStateLabel('error')).toBe('');
    expect(composerVoiceStateLabel('unsupported')).toBe('');
  });
});

describe('isComposerVoiceStateBusy', () => {
  it('is busy for every state that folds into an orb state other than idle', () => {
    expect(isComposerVoiceStateBusy('listening')).toBe(true);
    expect(isComposerVoiceStateBusy('awaiting_action')).toBe(true);
    expect(isComposerVoiceStateBusy('idle')).toBe(false);
    expect(isComposerVoiceStateBusy('error')).toBe(false);
    expect(isComposerVoiceStateBusy('unsupported')).toBe(false);
  });
});

describe('composerVoiceStateFromTranscription', () => {
  it('prefers a live recording over the workflow state', () => {
    expect(
      composerVoiceStateFromTranscription('idle', {
        isRecording: true,
        isTranscribing: false,
        isSupported: true,
      }),
    ).toBe('listening');
  });

  it('prefers transcribing over the workflow state once recording stops', () => {
    expect(
      composerVoiceStateFromTranscription('idle', {
        isRecording: false,
        isTranscribing: true,
        isSupported: true,
      }),
    ).toBe('transcribing');
  });

  it('reports unsupported when the platform offers no capture path', () => {
    expect(
      composerVoiceStateFromTranscription('idle', {
        isRecording: false,
        isTranscribing: false,
        isSupported: false,
      }),
    ).toBe('unsupported');
  });

  it('falls through to the workflow state once capture is quiet', () => {
    expect(
      composerVoiceStateFromTranscription('executing', {
        isRecording: false,
        isTranscribing: false,
        isSupported: true,
      }),
    ).toBe('executing');
  });
});
