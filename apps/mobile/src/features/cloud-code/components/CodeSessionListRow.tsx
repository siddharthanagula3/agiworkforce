import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Cloud, Laptop } from 'lucide-react-native';
import {
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
} from '@agiworkforce/types';
import { Badge } from '@/components/ui/Badge';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  REMOTE_SESSION_ORIGIN_LABELS,
  codeSessionStatusColor,
  codeSessionStatusLabel,
} from '@/src/features/companion/components/CodeSessionsCard';
import { formatRelativeTime } from '@/src/lib/time';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  CLOUD_CODE_STATE_BADGE_COLORS,
  cloudCodeWorkspaceLabel,
  type CodeListEntry,
} from '../presentation';

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['color']>;

export const CLOUD_LOCATION_LABEL = 'In the cloud';

export function computerLocationLabel(computerName: string | null): string {
  return computerName ? `On ${computerName}` : 'On your computer';
}

function age(updatedAt: string): string | null {
  return Number.isNaN(Date.parse(updatedAt)) ? null : formatRelativeTime(updatedAt);
}

function describe(entry: CodeListEntry): {
  title: string;
  detail: string;
  badge: { label: string; tone: BadgeTone };
} {
  if (entry.kind === 'cloud') {
    const { session } = entry;
    const archived = session.archivedAt !== null;
    return {
      title: session.title,
      detail: [age(session.updatedAt), cloudCodeWorkspaceLabel(session)]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      badge: {
        label: archived
          ? CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.archived
          : CLOUD_CODE_SESSION_STATE_LABELS[session.state],
        tone: archived ? 'gray' : CLOUD_CODE_STATE_BADGE_COLORS[session.state],
      },
    };
  }
  const { session } = entry;
  return {
    title: session.title,
    detail: [
      age(session.updatedAt),
      session.origin ? REMOTE_SESSION_ORIGIN_LABELS[session.origin] : null,
      session.folder,
      session.branch,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    badge: {
      label: codeSessionStatusLabel(session.status),
      tone: codeSessionStatusColor(session.status),
    },
  };
}

export function CodeSessionListRow({
  entry,
  computerName,
  computerConnected,
  onOpen,
}: {
  entry: CodeListEntry;
  computerName: string | null;
  computerConnected: boolean;
  onOpen: (entry: CodeListEntry) => void;
}) {
  const colors = useThemeColors();
  const { title, detail, badge } = describe(entry);
  const onComputer = entry.kind === 'computer';
  const location = onComputer ? computerLocationLabel(computerName) : CLOUD_LOCATION_LABEL;
  const LocationIcon = onComputer ? Laptop : Cloud;

  return (
    <PressableBox
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityLabel={[title, badge.label, location, detail].filter(Boolean).join('. ')}
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
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LocationIcon
            testID={onComputer ? 'code-session-location-computer' : 'code-session-location-cloud'}
            size={14}
            color={onComputer && computerConnected ? colors.agentSuccess : colors.textMuted}
          />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.footnote }}
          >
            {detail}
          </Text>
        </View>
      </View>
      <Badge label={badge.label} color={badge.tone} />
    </PressableBox>
  );
}
