import { View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { AccountSessions } from './service';

const TITLE = 'Review where you’re logged in';
const BODY = 'Log out of devices you don’t recognize';

export function hasOtherSignedInDevice(sessions: AccountSessions | null): boolean {
  if (!sessions) return false;
  if (sessions.currentSessionKnown) return sessions.sessions.some((row) => !row.isCurrent);
  return sessions.sessions.length > 1;
}

export function SecurityRecommendation({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <View testID="security-recommendation" style={{ marginBottom: 24 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          fontWeight: '600',
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        Security recommendations
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${TITLE}. ${BODY}`}
        style={{
          minHeight: 64,
          borderRadius: cardRadius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceOverlay,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
            {TITLE}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.footnote,
              lineHeight: 19,
              marginTop: 2,
            }}
          >
            {BODY}
          </Text>
        </View>
        <View
          testID="security-recommendation-dot"
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.agentWarning }}
        />
        <ChevronRight size={17} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
