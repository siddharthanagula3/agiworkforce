import { Cloud } from 'lucide-react-native';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function StorageScopeNotice() {
  const colors = useThemeColors();

  return (
    <Card accessibilityLabel="AGI Cloud storage. Not metered">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Cloud size={18} color={colors.textSecondary} />
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.body,
            fontWeight: '700',
          }}
        >
          AGI Cloud Storage
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '600' }}>
          Not metered
        </Text>
      </View>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.caption,
          lineHeight: 18,
          marginTop: 9,
        }}
      >
        Your account does not currently publish a file-storage byte quota. The totals below measure
        only downloaded models and cache stored on this device.
      </Text>
    </Card>
  );
}
