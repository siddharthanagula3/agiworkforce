import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { formatRelativeTime } from '@/src/lib/time';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CLOUD_CODE_STATE_BADGE_COLORS, cloudCodeWorkspaceLabel } from '../presentation';

export function CloudCodeSessionRow({
  session,
  onOpen,
}: {
  session: CloudCodeSession;
  onOpen: (sessionId: string) => void;
}) {
  const colors = useThemeColors();
  const archived = session.archivedAt !== null;
  const stateLabel = archived
    ? CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.archived
    : CLOUD_CODE_SESSION_STATE_LABELS[session.state];
  const detail = [formatRelativeTime(session.updatedAt), cloudCodeWorkspaceLabel(session)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <PressableBox
      onPress={() => onOpen(session.id)}
      accessibilityRole="button"
      accessibilityLabel={`${session.title}. ${stateLabel}. ${detail}`}
      style={({ pressed }) => ({
        minHeight: 64,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {session.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
          {detail}
        </Text>
      </View>
      <Badge
        label={stateLabel}
        color={archived ? 'gray' : CLOUD_CODE_STATE_BADGE_COLORS[session.state]}
      />
    </PressableBox>
  );
}
