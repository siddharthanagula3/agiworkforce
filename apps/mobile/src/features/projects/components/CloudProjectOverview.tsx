import { useCallback, useState } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import { updateCloudProjectAppearance } from '@/src/features/projects/service';
import {
  PROJECT_ACCENTS,
  PROJECT_ICONS,
  projectAccentHex,
  projectIcon,
  type ProjectAccentId,
} from '@/src/features/projects/projectAppearance';
import type { CloudProject, CloudProjectDetails } from '@/stores/projects/cloudProjectStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { formatRelativeTime } from '@/src/lib/time';
import { typeScale } from '@/src/ui/theme/tokens';

function countLabel(value: number | null | undefined, one: string, many: string): string | null {
  if (value === null || value === undefined) return null;
  return value === 1 ? `1 ${one}` : `${value} ${many}`;
}

export function CloudProjectOverview({
  project,
  details,
}: {
  project: CloudProject;
  details: CloudProjectDetails | undefined;
}) {
  const projectId = project.id;
  const description = project.description?.trim();
  const instructions = project.instructions?.trim();
  const lastChatAt = useChatCloudMessageStore((s) =>
    s.conversations.reduce<string | null>(
      (latest, c) =>
        c.projectId === projectId && (!latest || c.updatedAt > latest) ? c.updatedAt : latest,
      null,
    ),
  );
  const lastUsedAt = lastChatAt && lastChatAt > project.updatedAt ? lastChatAt : project.updatedAt;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const Icon = projectIcon(details?.iconEmoji);
  const accent = projectAccentHex(details?.accentColor) ?? colors.teal;
  const meta = [
    countLabel(details?.conversationCount, 'chat', 'chats'),
    countLabel(details?.knowledgeFileCount, 'file', 'files'),
    details?.defaultModelId
      ? `Default model: ${getManagedDisplayName(details.defaultModelId)}`
      : null,
    `Last used ${formatRelativeTime(lastUsedAt)}`,
  ].filter((item): item is string => Boolean(item));

  const applyAppearance = useCallback(
    (patch: { iconEmoji?: string; accentColor?: ProjectAccentId }) => {
      void updateCloudProjectAppearance(projectId, patch).catch(() => {
        Alert.alert(
          'Could not update the project appearance',
          'The change has been undone. Check your connection and try again.',
        );
      });
    },
    [projectId],
  );

  return (
    <View
      style={{
        margin: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
        gap: 8,
      }}
      testID="project-detail-cloud-header"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PressableBox
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Change project icon and colour"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${accent}22`,
          }}
        >
          <Icon size={22} color={accent} />
        </PressableBox>
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontSize: typeScale.body,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          numberOfLines={2}
        >
          {project.name}
        </Text>
      </View>
      {description ? (
        <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
          {description}
        </Text>
      ) : null}
      {instructions ? (
        <Text
          testID="project-detail-instructions"
          numberOfLines={2}
          style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textPrimary }}
          >
            Instructions:{' '}
          </Text>
          {instructions}
        </Text>
      ) : null}
      <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>
        {`${meta.join(' · ')}. Synced across your devices.`}
      </Text>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPickerOpen(false)}
      >
        <PressableBox
          accessibilityViewIsModal
          style={{ flex: 1, backgroundColor: colors.scrim }}
          onPress={() => setPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            gap: 12,
          }}
        >
          <Text
            style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
          >
            Project appearance
          </Text>
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textSecondary }}
          >
            Colour
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
            {PROJECT_ACCENTS.map((entry) => {
              const selected = details?.accentColor === entry.id;
              return (
                <PressableBox
                  key={entry.id}
                  onPress={() => applyAppearance({ accentColor: entry.id })}
                  accessibilityRole="radio"
                  accessibilityLabel={entry.label}
                  accessibilityState={{ selected }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: entry.hex,
                    borderWidth: 2,
                    borderColor: selected ? colors.textPrimary : colors.transparent,
                  }}
                >
                  {selected ? <Check size={18} color={colors.white} /> : null}
                </PressableBox>
              );
            })}
          </View>
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textSecondary }}
          >
            Icon
          </Text>
          <ScrollView style={{ maxHeight: 260 }}>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
              accessibilityRole="radiogroup"
            >
              {PROJECT_ICONS.map((entry) => {
                const selected = (details?.iconEmoji ?? 'folder') === entry.id;
                return (
                  <PressableBox
                    key={entry.id}
                    onPress={() => applyAppearance({ iconEmoji: entry.id })}
                    accessibilityRole="radio"
                    accessibilityLabel={entry.label}
                    accessibilityState={{ selected }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? colors.surfaceHover : colors.transparent,
                    }}
                  >
                    <entry.Icon size={20} color={selected ? accent : colors.textSecondary} />
                  </PressableBox>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
