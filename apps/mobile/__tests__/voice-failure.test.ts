import { VoiceCaptureError } from '@/src/features/voice/services/voiceInput';
import {
  VOICE_INPUT_DISABLED_MESSAGE,
  VOICE_NO_SPEECH_MESSAGE,
  VOICE_PERMISSION_MESSAGE,
  VOICE_STOPPED_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
  classifyVoiceFailure,
  voiceFailureMessage,
} from '@/src/features/voice/services/voiceFailure';
import { voiceCaptureErrorMessage } from '@/src/features/voice/hooks/useVoiceConversation';
import { showVoiceCaptureFailureAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { Alert } from 'react-native';

describe('voice failure wording', () => {
  it('never shows the engine text for a recogniser that cannot start', () => {
    const err = new VoiceCaptureError('recognition-error', 'Failed to initialize recognizer');

    expect(classifyVoiceFailure(err)).toBe('unavailable');
    expect(voiceFailureMessage(err)).toBe(VOICE_UNAVAILABLE_MESSAGE);
    expect(voiceCaptureErrorMessage(err)).toBe(VOICE_UNAVAILABLE_MESSAGE);
    expect(voiceCaptureErrorMessage(err)).not.toContain('recognizer');
  });

  it('keeps our own on-device message but hides an engine message with the same code', () => {
    const ours = new VoiceCaptureError(
      'on-device-recognition-unavailable',
      'Spanish has no on-device speech model installed.',
    );
    const engine = new VoiceCaptureError(
      'on-device-recognition-unavailable',
      'kAFAssistantErrorDomain error 1101',
      'service-not-allowed',
    );

    expect(voiceFailureMessage(ours)).toBe('Spanish has no on-device speech model installed.');
    expect(voiceFailureMessage(engine)).toBe(VOICE_UNAVAILABLE_MESSAGE);
  });

  it('tells silence apart from an unavailable recogniser', () => {
    const silence = new VoiceCaptureError('recognition-error', 'No speech detected', 'no-speech');
    const timeout = new VoiceCaptureError('recognition-error', 'timed out', 'speech-timeout');

    expect(classifyVoiceFailure(silence)).toBe('no-speech');
    expect(classifyVoiceFailure(timeout)).toBe('no-speech');
    expect(voiceFailureMessage(silence)).toBe(VOICE_NO_SPEECH_MESSAGE);
  });

  it('maps every other engine failure and a plain Error to the stopped line', () => {
    const network = new VoiceCaptureError('recognition-error', 'net down', 'network');

    expect(classifyVoiceFailure(network)).toBe('other');
    expect(voiceFailureMessage(network)).toBe(VOICE_STOPPED_MESSAGE);
    expect(voiceFailureMessage(new Error('boom'))).toBe(VOICE_STOPPED_MESSAGE);
    expect(voiceFailureMessage('boom')).toBe(VOICE_STOPPED_MESSAGE);
  });

  it('keeps the permission and disabled wording', () => {
    expect(voiceFailureMessage(new VoiceCaptureError('mic-permission-denied', 'denied'))).toBe(
      VOICE_PERMISSION_MESSAGE,
    );
    expect(voiceFailureMessage(new VoiceCaptureError('voice-input-disabled', 'x'))).toBe(
      VOICE_INPUT_DISABLED_MESSAGE,
    );
  });

  it('shows the voice button and voice screen alert in plain words with no retry when recognition cannot start', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const cannotStart = new VoiceCaptureError(
      'on-device-recognition-unavailable',
      'Failed to initialize recognizer',
      'audio-capture',
    );

    showVoiceCaptureFailureAlert(cannotStart);

    expect(alert).toHaveBeenCalledWith('Voice unavailable', VOICE_UNAVAILABLE_MESSAGE);
    expect(VOICE_UNAVAILABLE_MESSAGE).not.toMatch(/try again/i);
    alert.mockRestore();
  });

  it('offers Settings from the voice alert when microphone access is off', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    showVoiceCaptureFailureAlert(new VoiceCaptureError('mic-permission-denied', 'denied'));

    expect(alert).toHaveBeenCalledWith(
      'Voice input unavailable',
      VOICE_PERMISSION_MESSAGE,
      expect.arrayContaining([expect.objectContaining({ text: 'Open Settings' })]),
    );
    alert.mockRestore();
  });
});
