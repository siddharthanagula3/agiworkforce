import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Cloud, Cpu, Lock } from 'lucide-react-native';
import { formatChatExecutionModeLabel } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { AppMode } from './ModeSwitchModal';

export interface ModeToggleProps {
  mode?: AppMode;
  cloudJoined?: boolean;
  waitlistRank?: number | undefined;
  onChange?: (mode: AppMode) => void;
  onTapCloud?: () => void;
}

export function ModeToggle({
  mode = 'local',
  cloudJoined = false,
  waitlistRank,
  onTapCloud,
}: ModeToggleProps): ReactElement {
  const colors = useThemeColors();
  const cloudLabel = cloudJoined
    ? waitlistRank
      ? `Waitlist #${waitlistRank}`
      : 'Waitlisted'
    : 'Waitlist';

  return (
    <View
      testID="chat.mode-toggle"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
        maxWidth: 260,
      }}
      accessibilityRole="tablist"
      accessibilityLabel="Chat execution mode"
    >
      <View
        testID="chat.mode-toggle.local"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          height: 28,
          borderRadius: 999,
          backgroundColor: mode === 'local' ? `${colors.teal}22` : 'transparent',
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'local' }}
        accessibilityLabel={formatChatExecutionModeLabel('local_only')}
      >
        <Cpu size={13} color={mode === 'local' ? colors.teal : colors.textMuted} />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: mode === 'local' ? colors.teal : colors.textMuted,
          }}
        >
          Local LLMs
        </Text>
      </View>

      <Pressable
        testID="chat.mode-toggle.cloud"
        onPress={onTapCloud}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 9,
          height: 28,
          borderRadius: 999,
          opacity: pressed ? 0.75 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel={`${formatChatExecutionModeLabel('cloud_managed')} ${cloudLabel}`}
        accessibilityHint="Opens the Cloud Managed waitlist"
      >
        {cloudJoined ? (
          <Cloud size={13} color={colors.textSecondary} />
        ) : (
          <Lock size={12} color={colors.textMuted} />
        )}
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontWeight: '500',
            color: cloudJoined ? colors.textSecondary : colors.textMuted,
          }}
        >
          {cloudLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default ModeToggle;
