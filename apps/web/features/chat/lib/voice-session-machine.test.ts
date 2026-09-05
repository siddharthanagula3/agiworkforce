import { describe, expect, it } from 'vitest';

import {
  advanceBargeIn,
  advanceSpeechWindow,
  BARGE_IN_LEVEL_THRESHOLD,
  BARGE_IN_SAMPLE_COUNT,
  INITIAL_SPEECH_WINDOW,
  INITIAL_VOICE_SESSION_STATE,
  isVoiceSessionActive,
  MIN_UTTERANCE_MS,
  orbStateForStatus,
  orbStateLabel,
  ORB_STATE,
  SILENCE_LEVEL_THRESHOLD,
  SILENCE_WINDOW_MS,
  SPEECH_LEVEL_THRESHOLD,
  UTTERANCE_CANCEL_WINDOW_MS,
  voiceSessionReducer,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from './voice-session-machine';

function run(events: VoiceSessionEvent[], from = INITIAL_VOICE_SESSION_STATE): VoiceSessionState {
  return events.reduce(voiceSessionReducer, from);
}

const ENTER: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.enter };
const READY_LIVE: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.ready, listening: true };
const READY_MUTED: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.ready, listening: false };
const SPEECH_END: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.speechEnd };
const TRANSCRIBED: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.transcribed, text: 'hello' };
const COMMIT: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.commitUtterance };
const SPOKEN_REPLY: VoiceSessionEvent = { type: VOICE_SESSION_EVENT.replyComplete, spoken: true };

describe('voiceSessionReducer', () => {
  it('starts exited and enters only from exited', () => {
    expect(INITIAL_VOICE_SESSION_STATE.status).toBe(VOICE_SESSION_STATUS.exited);
    expect(isVoiceSessionActive(VOICE_SESSION_STATUS.exited)).toBe(false);

    const entering = run([ENTER]);
    expect(entering.status).toBe(VOICE_SESSION_STATUS.entering);
    expect(run([ENTER, ENTER])).toEqual(entering);
  });

  it('listens live when permission is already granted', () => {
    const state = run([ENTER, READY_LIVE]);
    expect(state.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(state.muted).toBe(false);
  });

  it('starts muted when permission is not already granted', () => {
    const state = run([ENTER, READY_MUTED]);
    expect(state.status).toBe(VOICE_SESSION_STATUS.muted);
    expect(state.muted).toBe(true);
  });

  it('walks a spoken turn from listening to speaking and back to listening', () => {
    const transcribing = run([ENTER, READY_LIVE, SPEECH_END]);
    expect(transcribing.status).toBe(VOICE_SESSION_STATUS.transcribing);

    const sending = voiceSessionReducer(transcribing, TRANSCRIBED);
    expect(sending.status).toBe(VOICE_SESSION_STATUS.sending);
    expect(sending.pendingUtterance).toBe('hello');

    const streaming = voiceSessionReducer(sending, COMMIT);
    expect(streaming.status).toBe(VOICE_SESSION_STATUS.streaming);
    expect(streaming.pendingUtterance).toBeNull();

    const speaking = voiceSessionReducer(streaming, SPOKEN_REPLY);
    expect(speaking.status).toBe(VOICE_SESSION_STATUS.speaking);

    const resumed = voiceSessionReducer(speaking, { type: VOICE_SESSION_EVENT.playbackComplete });
    expect(resumed.status).toBe(VOICE_SESSION_STATUS.listening);
  });

  it('drops the pending utterance when the cancel window is used', () => {
    const sending = run([ENTER, READY_LIVE, SPEECH_END, TRANSCRIBED]);
    const cancelled = voiceSessionReducer(sending, {
      type: VOICE_SESSION_EVENT.cancelUtterance,
    });

    expect(cancelled.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(cancelled.pendingUtterance).toBeNull();
  });

  it('resumes listening when the recording transcribed to nothing', () => {
    const transcribing = run([ENTER, READY_LIVE, SPEECH_END]);
    const resumed = voiceSessionReducer(transcribing, {
      type: VOICE_SESSION_EVENT.transcribed,
      text: '   ',
    });

    expect(resumed.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(resumed.pendingUtterance).toBeNull();
  });

  it('ignores a cancel that arrives after the utterance was committed', () => {
    const streaming = run([ENTER, READY_LIVE, SPEECH_END, TRANSCRIBED, COMMIT]);
    expect(voiceSessionReducer(streaming, { type: VOICE_SESSION_EVENT.cancelUtterance })).toEqual(
      streaming,
    );
  });

  it('gives the cancel window a length a person can act inside', () => {
    expect(UTTERANCE_CANCEL_WINDOW_MS).toBeGreaterThanOrEqual(1_000);
  });

  it('returns to muted rather than listening after a turn that started muted', () => {
    const muted = run([ENTER, READY_MUTED]);
    const streaming = voiceSessionReducer(muted, { type: VOICE_SESSION_EVENT.typedSubmit });
    expect(streaming.status).toBe(VOICE_SESSION_STATUS.streaming);
    expect(streaming.muted).toBe(true);

    const speaking = voiceSessionReducer(streaming, SPOKEN_REPLY);
    const resumed = voiceSessionReducer(speaking, { type: VOICE_SESSION_EVENT.playbackComplete });
    expect(resumed.status).toBe(VOICE_SESSION_STATUS.muted);
  });

  it('resumes without speaking when the reply cannot be spoken', () => {
    const streaming = run([ENTER, READY_LIVE, SPEECH_END, TRANSCRIBED, COMMIT]);
    const resumed = voiceSessionReducer(streaming, {
      type: VOICE_SESSION_EVENT.replyComplete,
      spoken: false,
    });
    expect(resumed.status).toBe(VOICE_SESSION_STATUS.listening);
  });

  it('mutes without interrupting a turn already in flight', () => {
    const streaming = run([ENTER, READY_LIVE, SPEECH_END, TRANSCRIBED, COMMIT]);
    const muted = voiceSessionReducer(streaming, { type: VOICE_SESSION_EVENT.mute });

    expect(muted.status).toBe(VOICE_SESSION_STATUS.streaming);
    expect(muted.muted).toBe(true);
  });

  it('mutes straight out of listening and unmutes back into it', () => {
    const listening = run([ENTER, READY_LIVE]);
    const muted = voiceSessionReducer(listening, { type: VOICE_SESSION_EVENT.mute });
    expect(muted.status).toBe(VOICE_SESSION_STATUS.muted);

    const unmuted = voiceSessionReducer(muted, { type: VOICE_SESSION_EVENT.unmute });
    expect(unmuted.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(unmuted.muted).toBe(false);
  });

  it('takes barge-in only out of speaking, and unmutes when it does', () => {
    const speaking = run([
      ENTER,
      READY_MUTED,
      { type: VOICE_SESSION_EVENT.typedSubmit },
      SPOKEN_REPLY,
    ]);
    const barged = voiceSessionReducer(speaking, { type: VOICE_SESSION_EVENT.bargeIn });

    expect(barged.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(barged.muted).toBe(false);

    const listening = run([ENTER, READY_LIVE]);
    expect(voiceSessionReducer(listening, { type: VOICE_SESSION_EVENT.bargeIn })).toEqual(
      listening,
    );
  });

  it('fails into an error that only retry or exit leaves', () => {
    const failed = run([ENTER, READY_LIVE, { type: VOICE_SESSION_EVENT.fail, message: 'denied' }]);
    expect(failed.status).toBe(VOICE_SESSION_STATUS.error);
    expect(failed.error).toBe('denied');

    expect(voiceSessionReducer(failed, SPEECH_END)).toEqual(failed);
    expect(voiceSessionReducer(failed, { type: VOICE_SESSION_EVENT.retry }).status).toBe(
      VOICE_SESSION_STATUS.entering,
    );
    expect(voiceSessionReducer(failed, { type: VOICE_SESSION_EVENT.exit })).toEqual(
      INITIAL_VOICE_SESSION_STATE,
    );
  });

  it('exits from every active status', () => {
    for (const status of Object.values(VOICE_SESSION_STATUS)) {
      const state: VoiceSessionState = { ...INITIAL_VOICE_SESSION_STATE, status };
      expect(voiceSessionReducer(state, { type: VOICE_SESSION_EVENT.exit })).toEqual(
        INITIAL_VOICE_SESSION_STATE,
      );
    }
  });
});

describe('orb state mapping', () => {
  it('maps each session status onto one orb state', () => {
    expect(orbStateForStatus(VOICE_SESSION_STATUS.listening)).toBe(ORB_STATE.listening);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.transcribing)).toBe(ORB_STATE.thinking);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.sending)).toBe(ORB_STATE.thinking);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.streaming)).toBe(ORB_STATE.thinking);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.speaking)).toBe(ORB_STATE.speaking);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.muted)).toBe(ORB_STATE.muted);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.entering)).toBe(ORB_STATE.idle);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.error)).toBe(ORB_STATE.idle);
    expect(orbStateForStatus(VOICE_SESSION_STATUS.exited)).toBe(ORB_STATE.idle);
  });

  it('words the four states the orb names and stays silent otherwise', () => {
    expect(orbStateLabel(VOICE_SESSION_STATUS.listening)).toBe('Listening');
    expect(orbStateLabel(VOICE_SESSION_STATUS.streaming)).toBe('Thinking');
    expect(orbStateLabel(VOICE_SESSION_STATUS.speaking)).toBe('Speaking');
    expect(orbStateLabel(VOICE_SESSION_STATUS.muted)).toBe('Muted');
    expect(orbStateLabel(VOICE_SESSION_STATUS.entering)).toBe('');
  });
});

describe('end of speech detection', () => {
  const loud = SPEECH_LEVEL_THRESHOLD + 0.05;
  const quiet = SILENCE_LEVEL_THRESHOLD / 2;

  it('opens an utterance on the first sample above the speech threshold', () => {
    const { state, ended } = advanceSpeechWindow(INITIAL_SPEECH_WINDOW, loud, 1_000);
    expect(ended).toBe(false);
    expect(state.speechStartedAt).toBe(1_000);
    expect(state.lastVoiceAt).toBe(1_000);
  });

  it('ends the utterance once the silence window elapses', () => {
    let window = advanceSpeechWindow(INITIAL_SPEECH_WINDOW, loud, 0).state;
    window = advanceSpeechWindow(window, loud, MIN_UTTERANCE_MS).state;

    const early = advanceSpeechWindow(window, quiet, MIN_UTTERANCE_MS + SILENCE_WINDOW_MS - 1);
    expect(early.ended).toBe(false);

    const done = advanceSpeechWindow(window, quiet, MIN_UTTERANCE_MS + SILENCE_WINDOW_MS);
    expect(done.ended).toBe(true);
    expect(done.state).toEqual(INITIAL_SPEECH_WINDOW);
  });

  it('discards a blip shorter than the minimum utterance', () => {
    const window = advanceSpeechWindow(INITIAL_SPEECH_WINDOW, loud, 0).state;
    const done = advanceSpeechWindow(window, quiet, SILENCE_WINDOW_MS);

    expect(done.ended).toBe(false);
    expect(done.state).toEqual(INITIAL_SPEECH_WINDOW);
  });

  it('never ends an utterance that never started', () => {
    expect(advanceSpeechWindow(INITIAL_SPEECH_WINDOW, quiet, 10_000).ended).toBe(false);
  });

  it('holds the window open through a level between the two thresholds', () => {
    let window = advanceSpeechWindow(INITIAL_SPEECH_WINDOW, loud, 0).state;
    window = advanceSpeechWindow(window, loud, MIN_UTTERANCE_MS).state;

    const held = advanceSpeechWindow(
      window,
      SILENCE_LEVEL_THRESHOLD,
      MIN_UTTERANCE_MS + SILENCE_WINDOW_MS,
    );
    expect(held.ended).toBe(false);
  });
});

describe('barge-in detection', () => {
  it('needs consecutive samples above the barge-in threshold', () => {
    let consecutive = 0;
    for (let sample = 1; sample < BARGE_IN_SAMPLE_COUNT; sample += 1) {
      const result = advanceBargeIn(consecutive, BARGE_IN_LEVEL_THRESHOLD);
      expect(result.triggered).toBe(false);
      consecutive = result.consecutive;
    }

    expect(advanceBargeIn(consecutive, BARGE_IN_LEVEL_THRESHOLD).triggered).toBe(true);
  });

  it('resets on the first sample below the threshold', () => {
    expect(advanceBargeIn(BARGE_IN_SAMPLE_COUNT - 1, 0)).toEqual({
      consecutive: 0,
      triggered: false,
    });
  });

  it('demands a louder sample than ordinary speech so playback is not its own trigger', () => {
    expect(BARGE_IN_LEVEL_THRESHOLD).toBeGreaterThan(SPEECH_LEVEL_THRESHOLD);
  });
});
