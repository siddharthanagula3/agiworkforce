import { View } from 'react-native';
import { Brain, MessageSquareText, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';

export interface MemoryControlsCardProps {
  isCloud: boolean;
  /** Master switch. When false the two switches below are inert and disabled. */
  memoryEnabled: boolean;
  referencePastChats: boolean;
  generateMemoryFromHistory: boolean;
  onMemoryEnabledChange: (enabled: boolean) => void;
  onReferencePastChatsChange: (enabled: boolean) => void;
  onGenerateMemoryFromHistoryChange: (enabled: boolean) => void;
}

export function MemoryControlsCard({
  isCloud,
  memoryEnabled,
  referencePastChats,
  generateMemoryFromHistory,
  onMemoryEnabledChange,
  onReferencePastChatsChange,
  onGenerateMemoryFromHistoryChange,
}: MemoryControlsCardProps) {
  const colors = useThemeColors();

  return (
    <View className="px-4">
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
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
              ? 'Use relevant Cloud chats and saved account memories when answering.'
              : 'Use relevant chats and saved memories on this device when answering.'
          }
          icon={MessageSquareText}
          value={memoryEnabled && referencePastChats}
          onValueChange={onReferencePastChatsChange}
          disabled={!memoryEnabled}
        />
        <SettingsSwitchRow
          label="Generate memory from chat history"
          description="Learn durable details from eligible, non-temporary chat turns."
          icon={Sparkles}
          value={memoryEnabled && generateMemoryFromHistory}
          onValueChange={onGenerateMemoryFromHistoryChange}
          disabled={!memoryEnabled || !referencePastChats}
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
          fontSize: 12,
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
    </View>
  );
}
