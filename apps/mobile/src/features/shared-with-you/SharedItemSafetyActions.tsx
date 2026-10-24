import { useState } from 'react';
import { View } from 'react-native';
import { EyeOff, Flag, type LucideIcon } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { SharedReportItem } from '@/services/contentReport';
import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';
import { confirmIrreversible } from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { hideSharer } from './hiddenSharers';

export function confirmHideSharer(accountId: string, sharerId: string, name: string) {
  return confirmIrreversible({
    title: `Hide ${name}?`,
    consequence: 'Nothing they share will show. Unhide in Shared with you.',
    actionLabel: 'Hide',
  }).then((confirmed) => {
    if (confirmed) hideSharer(accountId, sharerId, name);
    return confirmed;
  });
}

export function sharedReportTarget(item: SharedReportItem, title: string) {
  return {
    messageId: item.id,
    conversationId: `shared:${item.kind}`,
    contentExcerpt: title,
    sharedItem: item,
  };
}

function Pill({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon size={14} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{label}</Text>
    </Pressable>
  );
}

export function SharedItemSafetyActions({
  item,
  title,
  ownerName,
  accountId,
  onHidden,
}: {
  item: SharedReportItem;
  title: string;
  ownerName: string;
  accountId: string | null;
  onHidden: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pill icon={Flag} label="Report" onPress={() => setReporting(true)} />
      {accountId ? (
        <Pill
          icon={EyeOff}
          label={`Hide ${ownerName}`}
          onPress={() =>
            void confirmHideSharer(accountId, item.sharerId, ownerName).then((hidden) => {
              if (hidden) onHidden();
            })
          }
        />
      ) : null}
      {reporting ? (
        <ReportSheet
          visible
          onClose={() => setReporting(false)}
          target={sharedReportTarget(item, title)}
        />
      ) : null}
    </View>
  );
}
