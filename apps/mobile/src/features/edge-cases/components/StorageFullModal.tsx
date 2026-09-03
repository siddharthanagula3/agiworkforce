import { Modal, View, Pressable, Linking, Platform } from 'react-native';
import { HardDrive } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/src/ui/theme';

export interface StorageFullModalProps {
  visible: boolean;
  onCancel: () => void;
}

function openStorageSettings() {
  if (Platform.OS === 'ios') {
    Linking.openURL('App-Prefs:root=General&path=USAGE/STORAGE_AND_ICLOUD_STORAGE').catch(() => {
      Linking.openURL('App-Prefs:root=General').catch(() => {});
    });
  } else {
    Linking.openURL('android.settings.INTERNAL_STORAGE_SETTINGS').catch(() => {
      Linking.openSettings().catch(() => {});
    });
  }
}

export function StorageFullModal({ visible, onCancel }: StorageFullModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing['2xl'],
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radii.xl,
            padding: spacing['2xl'],
            width: '100%',
            maxWidth: 340,
            gap: spacing.lg,
          }}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore, alertdialog valid role
          accessibilityRole="alertdialog"
          accessibilityLabel={EDGE_COPY.storageFull.title}
        >
          {/* Icon */}
          <View
            style={{
              alignSelf: 'center',
              width: 52,
              height: 52,
              borderRadius: radii.full,
              backgroundColor: `${colors.agentWarning}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HardDrive size={24} color={colors.agentWarning} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {EDGE_COPY.storageFull.title}
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 14,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {EDGE_COPY.storageFull.body}
          </Text>

          {/* CTAs */}
          <Pressable
            onPress={openStorageSettings}
            style={{
              backgroundColor: colors.teal,
              borderRadius: radii.lg,
              paddingVertical: spacing.md,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.storageFull.openSettings}
            accessibilityHint="Opens device storage settings"
          >
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.storageFull.openSettings}
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={{
              alignItems: 'center',
              paddingVertical: spacing.sm,
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.storageFull.cancel}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {EDGE_COPY.storageFull.cancel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
