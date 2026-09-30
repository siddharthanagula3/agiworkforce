import { Alert, Linking } from 'react-native';

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
