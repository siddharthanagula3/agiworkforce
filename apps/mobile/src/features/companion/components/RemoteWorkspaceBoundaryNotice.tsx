import { FolderLock } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export function RemoteWorkspaceBoundaryNotice() {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLabel="Desktop folders stay Desktop-controlled"
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
      <FolderLock size={16} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>
          Desktop folders stay Desktop-controlled
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
          Pairing does not let this phone browse files or projects. Choose allowed folders and start
          path-scoped work on Desktop.
        </Text>
      </View>
    </View>
  );
}
