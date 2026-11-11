import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AlertOctagon } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { EMERGENCY_STOP_NOT_SENT_MESSAGES, sendEmergencyStop } from '@/services/companion';
import { useSettingsStore } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useThemeColors } from '@/src/ui/theme';

export const EMERGENCY_STOP_OFFLINE_NOTICE =
  'Your computer is not connected. A stop cannot reach it from here, so stop the tasks on the computer itself.';

export function EmergencyStopButton() {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const connected = useConnectionStore((s) => s.status === 'connected');

  const handlePress = useCallback(() => {
    Alert.alert(
      'Emergency Stop',
      'This will immediately cancel ALL running tasks on the desktop. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Everything',
          style: 'destructive',
          onPress: () => {
            if (hapticsEnabled) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            void sendEmergencyStop().then((result) => {
              if (result !== 'sent') {
                Alert.alert('Stop not sent', EMERGENCY_STOP_NOT_SENT_MESSAGES[result]);
              }
            });
          },
        },
      ],
    );
  }, [hapticsEnabled]);

  return (
    <View style={{ gap: 8 }}>
      {!connected ? (
        <Text
          testID="emergency-stop-offline"
          accessibilityRole="alert"
          className="text-sm text-center"
          style={{ color: colors.agentError }}
        >
          {EMERGENCY_STOP_OFFLINE_NOTICE}
        </Text>
      ) : null}
      <PressableBox
        onPress={handlePress}
        className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl active:opacity-80"
        style={{ backgroundColor: colors.agentError }}
        accessibilityLabel="Emergency stop, cancel all running tasks"
        accessibilityRole="button"
      >
        <AlertOctagon size={18} color={colors.accentText} />
        <Text className="text-[15px] font-bold" style={{ color: colors.accentText }}>
          Emergency Stop
        </Text>
      </PressableBox>
    </View>
  );
}
