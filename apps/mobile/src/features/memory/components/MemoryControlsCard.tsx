import { View } from 'react-native';
import {
  Brain,
  LockKeyhole,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react-native';
import { SENSITIVE_MEMORY_SUBJECTS } from '@agiworkforce/context';
import { Text } from '@/components/ui/Text';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { HelpArticleLink } from '@/src/features/support/HelpArticleLink';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export interface MemoryControlsCardProps {
  isCloud: boolean;
  memoryEnabled: boolean;
  referencePastChats: boolean;
  generateMemoryFromHistory: boolean;
  includeSensitiveTopics: boolean;
  onMemoryEnabledChange: (enabled: boolean) => void;
  onReferencePastChatsChange: (enabled: boolean) => void;
  onGenerateMemoryFromHistoryChange: (enabled: boolean) => void;
  onIncludeSensitiveTopicsChange: (enabled: boolean) => void;
  deletionWarning?: { onTryAgain: () => void; onDismiss: () => void } | null;
}

export const DELETION_WARNING_MESSAGE = "Deletion didn't finish. Some memories may still be saved.";

const SENSITIVE_TOPICS_DESCRIPTION = `Let AGI remember your ${SENSITIVE_MEMORY_SUBJECTS} from chats, not only when you say "Remember that" or add them yourself.`;

export function MemoryControlsCard({
  isCloud,
  memoryEnabled,
  referencePastChats,
  generateMemoryFromHistory,
  includeSensitiveTopics,
  onMemoryEnabledChange,
  onReferencePastChatsChange,
  onGenerateMemoryFromHistoryChange,
  onIncludeSensitiveTopicsChange,
  deletionWarning,
}: MemoryControlsCardProps) {
  const colors = useThemeColors();

  return (
    <View className="px-4">
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
          marginBottom: 8,
        }}
      >
        MEMORY CONTROLS
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label="Memory"
          description={
            isCloud
              ? 'Remember details from your Cloud chats to use later.'
              : 'Remember details from chats on this device to use later.'
          }
          icon={Brain}
          value={memoryEnabled}
          onValueChange={onMemoryEnabledChange}
        />
        <SettingsSwitchRow
          label="Search and reference chats"
          description={
            isCloud
              ? 'Search your other Cloud chats when answering.'
              : 'Search your other chats on this device when answering.'
          }
          icon={MessageSquareText}
          value={referencePastChats}
          onValueChange={onReferencePastChatsChange}
        />
        <SettingsSwitchRow
          label="Generate memory from chat history"
          description="Learn lasting details from chats, except temporary ones."
          icon={Sparkles}
          value={generateMemoryFromHistory}
          onValueChange={onGenerateMemoryFromHistoryChange}
          disabled={!memoryEnabled}
        />
        <SettingsSwitchRow
          label="Include sensitive topics in memory"
          description={SENSITIVE_TOPICS_DESCRIPTION}
          icon={LockKeyhole}
          value={includeSensitiveTopics}
          onValueChange={onIncludeSensitiveTopicsChange}
          disabled={!memoryEnabled}
          isLast={!deletionWarning}
        />
        {deletionWarning ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingLeft: 14,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TriangleAlert size={18} color={colors.agentError} />
            <View accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 0, paddingTop: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                {DELETION_WARNING_MESSAGE}
              </Text>
              <Pressable
                onPress={deletionWarning.onTryAgain}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={deletionWarning.onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'flex-start',
              }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
      </SettingsGroup>
      {/*
        Retention is stated per trust boundary: turning memory off must not read
        as "your memories were deleted", and the two boundaries keep the stored
        entries in different places.
      */}
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          lineHeight: 17,
          marginBottom: 16,
        }}
      >
        {memoryEnabled
          ? isCloud
            ? 'Cloud memories are stored on your AGI account and sync across devices.'
            : 'Memories stay on this device and are never uploaded.'
          : isCloud
            ? 'Memory is off. Existing entries stay on your account until you delete them.'
            : 'Memory is off. Existing entries stay on this device until you delete them.'}
      </Text>
      <View style={{ marginTop: -8, marginBottom: 8 }}>
        <HelpArticleLink docId="memory" label="How memory works" />
      </View>
    </View>
  );
}
