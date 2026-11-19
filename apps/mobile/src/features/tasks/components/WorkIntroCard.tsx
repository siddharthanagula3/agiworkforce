import { View } from 'react-native';
import { Bot } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';

import { useWorkIntroSources } from '../useWorkIntroSources';

export function WorkIntroCard({
  onNewTask,
  onConnectSources,
}: {
  onNewTask: () => void;
  onConnectSources: () => void;
}) {
  const colors = useThemeColors();
  const { offered, needsConnect } = useWorkIntroSources();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 260,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Bot size={32} color={colors.textMuted} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        Hand off a task
      </Text>
      {offered ? (
        <Text
          style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}
        >
          AGI Work can read your email and calendar when you connect them
        </Text>
      ) : null}
      <Button title="New task" onPress={onNewTask} size="lg" style={{ marginTop: 24 }} />
      {offered && needsConnect ? (
        <Button
          title="Connect email and calendar"
          variant="ghost"
          onPress={onConnectSources}
          style={{ marginTop: 8 }}
        />
      ) : null}
    </View>
  );
}
