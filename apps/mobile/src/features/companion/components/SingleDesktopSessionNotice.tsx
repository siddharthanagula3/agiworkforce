import { LockKeyhole } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export function SingleDesktopSessionNotice() {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLabel="One active Desktop per pairing session"
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        backgroundColor: colors.neutralSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <LockKeyhole size={16} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>
          One active Desktop per pairing session
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
          Pairing codes and session keys are short-lived and are not saved as reusable device
          access.
        </Text>
      </View>
    </View>
  );
}
