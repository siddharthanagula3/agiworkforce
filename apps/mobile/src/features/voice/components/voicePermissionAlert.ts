import { Alert, Linking } from 'react-native';
import { showToast } from '@/src/shared/components/Toast';
import {
  classifyVoiceFailure,
  voiceFailureMessage,
} from '@/src/features/voice/services/voiceFailure';

export function showVoicePermissionAlert(message: string): void {
  Alert.alert('Voice input unavailable', message, [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        void Linking.openSettings().catch(() => {
          Alert.alert(
            'Settings unavailable',
            'Open your device Settings to allow microphone access.',
          );
        });
      },
    },
  ]);
}

const VOICE_FAILURE_ALERT_TITLE: Record<
  'unavailable' | 'busy' | 'duration' | 'disabled' | 'other',
  string
> = {
  unavailable: 'Voice unavailable',
  busy: 'Voice is busy',
  duration: 'Listening stopped',
  disabled: 'Voice Input is off',
  other: 'Voice input stopped',
};

export function showVoiceCaptureFailureAlert(
  err: unknown,
  showQuietNotice: (message: string) => void = showToast,
): void {
  const kind = classifyVoiceFailure(err);
  if (kind === 'aborted') return;
  const message = voiceFailureMessage(err);
  if (kind === 'no-speech') showQuietNotice(message);
  else if (kind === 'permission') showVoicePermissionAlert(message);
  else Alert.alert(VOICE_FAILURE_ALERT_TITLE[kind], message);
}
