import { Alert, Linking } from 'react-native';
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

export function showVoiceCaptureFailureAlert(err: unknown): void {
  const message = voiceFailureMessage(err);
  if (classifyVoiceFailure(err) === 'permission') showVoicePermissionAlert(message);
  else Alert.alert('Voice unavailable', message);
}
