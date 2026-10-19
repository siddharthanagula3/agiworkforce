import { View } from 'react-native';
import { Brain, LockKeyhole, MessageSquareText, Sparkles } from 'lucide-react-native';
import { SENSITIVE_MEMORY_SUBJECTS } from '@agiworkforce/context';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
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
}

const SENSITIVE_TOPICS_DESCRIPTION = `Let AGI remember your ${SENSITIVE_MEMORY_SUBJECTS} from chats. While this is off, AGI is designed to keep these only when you say "Remember that" in a chat on the web, desktop, mobile or Chrome, or add them yourself. Memories saved earlier stay until you delete them.`;

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
              ? 'Let AGI remember details from your Cloud chats and use them later.'
              : 'Let AGI remember details from your chats on this device and use them later.'
          }
          icon={Brain}
          value={memoryEnabled}
          onValueChange={onMemoryEnabledChange}
        />
        <SettingsSwitchRow
          label="Search and reference chats"
          description={
            isCloud
              ? 'Let AGI search your other Cloud chats for relevant details when answering.'
              : 'Let AGI search your other chats on this device for relevant details when answering.'
          }
          icon={MessageSquareText}
          value={referencePastChats}
          onValueChange={onReferencePastChatsChange}
        />
        <SettingsSwitchRow
          label="Generate memory from chat history"
          description="Learn durable details from eligible, non-temporary chat turns."
          icon={Sparkles}
          value={memoryEnabled && generateMemoryFromHistory}
          onValueChange={onGenerateMemoryFromHistoryChange}
          disabled={!memoryEnabled}
        />
        <SettingsSwitchRow
          label="Include sensitive topics in memory"
          description={SENSITIVE_TOPICS_DESCRIPTION}
          icon={LockKeyhole}
          value={memoryEnabled && includeSensitiveTopics}
          onValueChange={onIncludeSensitiveTopicsChange}
          disabled={!memoryEnabled}
          isLast
        />
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
            ? 'Cloud memories are stored on your AGI account and sync across your signed-in devices. Delete an entry below to remove it.'
            : 'Local memories are stored on this device only and are never sent to our servers. Delete an entry below to remove it.'
          : isCloud
            ? 'Memory is off. This device will not read or add memories, and new account memories are no longer generated from your chats. Existing entries stay on your account until you delete them.'
            : 'Memory is off. Nothing is read or added while it stays off. Existing entries stay on this device until you delete them.'}
      </Text>
      <View style={{ marginTop: -8, marginBottom: 8 }}>
        <HelpArticleLink docId="memory" label="How memory works" />
      </View>
    </View>
  );
}
