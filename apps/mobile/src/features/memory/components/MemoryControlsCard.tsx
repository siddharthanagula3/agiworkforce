import { View } from 'react-native';
import { MessageSquareText, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';

export interface MemoryControlsCardProps {
  isCloud: boolean;
  referencePastChats: boolean;
  generateMemoryFromHistory: boolean;
  onReferencePastChatsChange: (enabled: boolean) => void;
  onGenerateMemoryFromHistoryChange: (enabled: boolean) => void;
}

export function MemoryControlsCard({
  isCloud,
  referencePastChats,
  generateMemoryFromHistory,
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
          label="Search and reference chats"
          description={
            isCloud
              ? 'Use relevant Cloud chats and saved account memories when answering.'
              : 'Use relevant chats and saved memories on this device when answering.'
          }
          icon={MessageSquareText}
          value={referencePastChats}
          onValueChange={onReferencePastChatsChange}
        />
        <SettingsSwitchRow
          label="Generate memory from chat history"
          description="Learn durable details from eligible, non-temporary chat turns."
          icon={Sparkles}
          value={generateMemoryFromHistory}
          onValueChange={onGenerateMemoryFromHistoryChange}
          disabled={!referencePastChats}
          isLast
        />
      </SettingsGroup>
    </View>
  );
}
